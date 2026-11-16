import { randomBytes, createHash } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { isAuthApiError, isAuthRetryableFetchError, type Session } from '@supabase/supabase-js';
import { z } from 'zod';
import { AppError } from '../utils/index.js';
import { supabaseAuth } from './supabase.js';
import { browserAuthProvider } from './provider.js';
import { authRateLimit, browserMutation } from './browserSecurity.js';
import { clearSession, clearUnusedSessionCookies, cookieName, cookieOptions, openCookie, readCookie, readCookieSession,
    requireSessionBinding, sealCookie, SESSION_LIFETIME_MS, writeSession, type CookieSession } from './cookies.js';

const router = Router();
router.use(browserMutation, authRateLimit());
router.use((req, res, next) => {
    try { clearUnusedSessionCookies(req.headers.cookie, res); next(); } catch (error) { next(error); }
});
const email = z.string().trim().email().max(320);
const credentials = z.object({ email, password: z.string().min(1).max(1024) });
const pkceSchema = z.object({ verifier: z.string().min(32).max(256), deadline: z.number(), origin: z.string() });

function failure(error: unknown, message = '認証に失敗しました。入力内容を確認してください。'): never {
    if (isAuthRetryableFetchError(error) || (isAuthApiError(error) && error.status >= 500)) throw error;
    throw new AppError({ code: 'AUTH_INVALID', status: 401, message });
}
async function verifiedUser(accessToken: string, expectedId?: string) {
    const { data, error } = await supabaseAuth.auth.getUser(accessToken);
    if (error || !data.user) failure(error);
    if (expectedId && data.user.id !== expectedId) failure(null);
    return { id: data.user.id, email: data.user.email ?? null };
}
function fromProvider(session: Session, userId: string, old?: CookieSession): CookieSession {
    if (!session.access_token || !session.refresh_token || !session.expires_at) throw new Error('認証応答が不正です。');
    return { id: old?.id ?? randomBytes(16).toString('hex'), userId,
        accessToken: session.access_token, refreshToken: session.refresh_token, expiresAt: session.expires_at,
        deadline: old?.deadline ?? Date.now() + SESSION_LIFETIME_MS };
}
function snapshot(session: CookieSession, user: { id: string; email: string | null }) {
    return { id: session.id, user, expiresAt: session.expiresAt };
}
async function loginResponse(req: Request, res: Response, session: Session) {
    const user = await verifiedUser(session.access_token);
    const current = readCookieSession(req.headers.cookie);
    const next = fromProvider(session, user.id);
    // Seal before clearing the old cookie, so a size/configuration failure does
    // not destroy a valid existing login.
    sealCookie(next, next.id);
    clearSession(res, current);
    writeSession(res, next, true);
    res.json({ session: snapshot(next, user) });
}
function body<T>(schema: z.ZodType<T>, req: Request): T {
    const result = schema.safeParse(req.body);
    if (!result.success) throw new AppError({ code: 'INVALID_AUTH_INPUT', status: 400, message: '入力内容を確認してください。' });
    return result.data;
}
function post(path: string, handler: (req: Request, res: Response) => Promise<unknown>) {
    router.post(path, (req, res, next) => { void handler(req, res).catch(error => next(error instanceof AppError ? error :
        new AppError({ code: 'INTERNAL_SERVER_ERROR', status: 500, message: 'サーバー内部エラーが発生しました。', cause: error }))); });
}

post('/login', async (req, res) => {
    // Validate cookie configuration before sending credentials to Supabase.
    cookieOptions();
    const input = body(credentials.strict(), req);
    const { data, error } = await browserAuthProvider.signIn(input.email, input.password);
    if (error || !data.session) failure(error);
    await loginResponse(req, res, data.session);
});

post('/register', async (req, res) => {
    cookieOptions();
    const input = body(credentials.extend({ displayName: z.string().trim().max(100).optional() }).strict(), req);
    const origin = req.headers.origin!;
    const { data, error, verifier } = await browserAuthProvider.signUp(input.email, input.password, input.displayName, origin);
    if (error) failure(error, '新規登録に失敗しました。入力内容を確認してください。');
    if (data.session) return loginResponse(req, res, data.session);
    if (verifier) res.cookie(cookieName('pkce'), sealCookie({ verifier, origin, deadline: Date.now() + 60 * 60_000 }, 'pkce'),
        { ...cookieOptions(), maxAge: 60 * 60_000 });
    res.json({ session: null, needsEmailConfirmation: true });
});

post('/resend', async (req, res) => {
    const input = body(z.object({ email }).strict(), req);
    const { error } = await browserAuthProvider.resend(input.email, req.headers.origin!);
    if (error) failure(error, '確認メールを再送信できませんでした。時間をおいて再試行してください。');
    res.json({ ok: true });
});

post('/callback', async (req, res) => {
    const { code } = body(z.object({ code: z.string().min(1).max(2048) }).strict(), req);
    const parsed = pkceSchema.safeParse(openCookie(readCookie(req.headers.cookie, cookieName('pkce')), 'pkce'));
    if (!parsed.success || parsed.data.deadline <= Date.now() || parsed.data.origin !== req.headers.origin) {
        throw new AppError({ code: 'AUTH_CALLBACK_INVALID', status: 400, message: '登録したブラウザで確認リンクを開くか、メール確認後にログインしてください。' });
    }
    const { data, error } = await browserAuthProvider.exchange(code, parsed.data.verifier);
    if (error || !data.session) failure(error, 'メール確認後に、ログインをやり直してください。');
    await loginResponse(req, res, data.session);
});

// Deduplicate parallel refreshes within one server process, retaining only a
// short rotation-overlap window. Supabase remains the session authority.
const refreshes = new Map<string, { until: number; promise: Promise<CookieSession> }>();
async function refresh(session: CookieSession): Promise<CookieSession> {
    const now = Date.now();
    for (const [key, value] of refreshes) if (value.until <= now) refreshes.delete(key);
    const key = createHash('sha256').update(session.id + ':' + session.refreshToken).digest('hex');
    const existing = refreshes.get(key);
    if (existing) return existing.promise;
    if (refreshes.size >= 512) throw new AppError({ code: 'AUTH_BUSY', status: 503, message: '時間をおいて再試行してください。' });
    const entry = { until: now + 60_000, promise: Promise.resolve(session) };
    entry.promise = (async () => {
        const { data, error } = await browserAuthProvider.refresh(session.refreshToken);
        if (error || !data.session) failure(error);
        const user = await verifiedUser(data.session.access_token, session.userId);
        return fromProvider(data.session, user.id, session);
    })();
    refreshes.set(key, entry);
    entry.promise.then(() => { entry.until = Date.now() + 5_000; }, () => { refreshes.delete(key); });
    return entry.promise;
}

post('/session', async (req, res) => {
    const current = readCookieSession(req.headers.cookie);
    if (!current) { res.json({ session: null }); return; }
    try {
        const next = current.expiresAt <= Date.now() / 1000 + 60 ? await refresh(current) : current;
        const user = await verifiedUser(next.accessToken, current.userId);
        if (next !== current) writeSession(res, next, false);
        res.json({ session: snapshot(next, user) });
    } catch (error) {
        if (!(error instanceof AppError) || error.status !== 401) throw error;
        // Do not clear the active pointer: a late rejection from an old session
        // must not log out a newer login in this browser.
        res.clearCookie(cookieName('auth_' + current.id), cookieOptions());
        res.json({ session: null });
    }
});

post('/logout', async (req, res) => {
    const current = readCookieSession(req.headers.cookie);
    if (current) {
        requireSessionBinding(req.get('x-kigen-session'), current);
        let latest: CookieSession | null = current;
        if (current.expiresAt <= Date.now() / 1000) {
            try { latest = await refresh(current); }
            catch (error) { if (error instanceof AppError && error.status === 401) latest = null; else throw error; }
        }
        if (latest) {
            const { error } = await browserAuthProvider.signOut(latest.accessToken);
            if (error && !(isAuthApiError(error) && [401, 403, 404].includes(error.status))) throw error;
        }
    }
    clearSession(res, current);
    res.json({ session: null });
});

export default router;
