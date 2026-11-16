import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { CookieOptions, Response } from 'express';
import { AppError, readEnv } from '../utils/index.js';

export const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
export interface CookieSession {
    id: string;
    userId: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    deadline: number;
}

function config() {
    const secret = readEnv('AUTH_COOKIE_SECRET');
    const secure = readEnv('AUTH_COOKIE_SECURE') !== 'false';
    if (!secret || !/^[a-f0-9]{64}$/i.test(secret) || (!secure && readEnv('NODE_ENV') === 'production')) {
        throw new Error('認証Cookieのサーバー設定を確認してください。');
    }
    return { key: Buffer.from(secret, 'hex'), prefix: secure ? '__Host-kigen_' : 'kigen_', secure };
}

export function cookieOptions(): CookieOptions {
    return { httpOnly: true, secure: config().secure, sameSite: 'lax', path: '/' };
}

export function cookieName(suffix: string): string { return config().prefix + suffix; }

// Duplicate cookie names are ambiguous (for example, a parent-domain cookie).
// Reject them instead of choosing whichever an intermediary put first.
export function readCookie(header: string | undefined, name: string): string | null {
    const matches = (header ?? '').split(';').map(part => part.trim()).filter(part => part.startsWith(name + '='));
    return matches.length === 1 ? matches[0].slice(name.length + 1) : null;
}

export function sealCookie(value: unknown, purpose: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', config().key, iv);
    cipher.setAAD(Buffer.from('kigen404:v1:' + purpose));
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    const sealed = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url');
    if (sealed.length > 3700) throw new Error('認証Cookieの上限を超えました。');
    return sealed;
}

export function openCookie(value: string | null, purpose: string): unknown {
    const { key } = config();
    if (!value || value.length > 3700 || !/^[\w-]+$/.test(value)) return null;
    try {
        const bytes = Buffer.from(value, 'base64url');
        const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
        decipher.setAAD(Buffer.from('kigen404:v1:' + purpose));
        decipher.setAuthTag(bytes.subarray(12, 28));
        return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'));
    } catch { return null; }
}

export function hasCookieSession(header: string | undefined): boolean {
    return /(?:^|;\s*)(?:__Host-)?kigen_session=/.test(header ?? '');
}

export function readCookieSession(header: string | undefined, now = Date.now()): CookieSession | null {
    const id = readCookie(header, cookieName('session'));
    if (!id || !/^[a-f0-9]{32}$/.test(id)) return null;
    const value = openCookie(readCookie(header, cookieName('auth_' + id)), id) as Partial<CookieSession> | null;
    if (!value || value.id !== id || typeof value.userId !== 'string' ||
        typeof value.accessToken !== 'string' || !value.accessToken || typeof value.refreshToken !== 'string' || !value.refreshToken ||
        typeof value.expiresAt !== 'number' || !Number.isFinite(value.expiresAt) ||
        typeof value.deadline !== 'number' || !Number.isFinite(value.deadline) || value.deadline <= now) return null;
    return value as CookieSession;
}

export function writeSession(res: Response, session: CookieSession, initial: boolean) {
    // Refresh only writes this login's credential cookie. A late refresh cannot
    // restore the active pointer after logout or replace a newer login's cookie.
    const value = sealCookie(session, session.id);
    const options = { ...cookieOptions(), maxAge: Math.max(0, session.deadline - Date.now()) };
    res.cookie(cookieName('auth_' + session.id), value, options);
    if (initial) res.cookie(cookieName('session'), session.id, options);
}

export function clearSession(res: Response, session: CookieSession | null) {
    res.clearCookie(cookieName('session'), cookieOptions());
    if (session) res.clearCookie(cookieName('auth_' + session.id), cookieOptions());
    res.clearCookie(cookieName('pkce'), cookieOptions());
}

export function clearUnusedSessionCookies(header: string | undefined, res: Response) {
    const prefix = cookieName('auth_');
    const active = readCookie(header, cookieName('session'));
    for (const part of (header ?? '').split(';')) {
        const name = part.trim().split('=')[0];
        const id = name.slice(prefix.length);
        if (name.startsWith(prefix) && /^[a-f0-9]{32}$/.test(id) && id !== active) res.clearCookie(name, cookieOptions());
    }
}

export function requireSessionBinding(actual: string | undefined, session: CookieSession) {
    if (actual !== session.id) throw new AppError({ code: 'AUTH_SESSION_CHANGED', status: 409,
        message: 'ログイン状態が変わりました。もう一度操作してください。' });
}
