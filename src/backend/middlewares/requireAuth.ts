import { isAuthApiError, isAuthRetryableFetchError } from '@supabase/supabase-js';
import type { NextLike, RequestLike, ResponseLike } from '../types/index.js';
import { supabaseAuth } from '../auth/supabase.js';
import { AppError } from '../utils/index.js';
import { hasCookieSession, readCookieSession, requireSessionBinding } from '../auth/cookies.js';
import { verifyBrowserMutation } from '../auth/browserSecurity.js';

export async function requireAuth(
    req: RequestLike,
    _res: ResponseLike,
    next: NextLike,
): Promise<void> {
    const rawHeader = req.headers?.authorization ?? req.headers?.Authorization;
    const authorization = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    let token = extractBearerToken(authorization);
    let expectedUserId: string | undefined;
    if (hasCookieSession(typeof req.headers?.cookie === 'string' ? req.headers.cookie : undefined)) {
        try {
            if (authorization) throw new AppError({ code: 'AUTH_AMBIGUOUS', status: 400, message: '認証方法を確認してください。' });
            const session = readCookieSession(req.headers?.cookie as string);
            if (!session || session.expiresAt <= Date.now() / 1000) { next(buildAuthRequiredError()); return; }
            requireSessionBinding(typeof req.headers?.['x-kigen-session'] === 'string' ? req.headers['x-kigen-session'] : undefined, session);
            if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method ?? 'GET')) verifyBrowserMutation(req.headers ?? {});
            token = session.accessToken;
            expectedUserId = session.userId;
        } catch (error) { next(error); return; }
    }

    if (!token) {
        next(buildAuthRequiredError());
        return;
    }

    // JWTを独自検証せずSupabaseへ照会し、失効を含む現在の認証状態を正本に従わせます。
    let verified: Awaited<ReturnType<typeof supabaseAuth.auth.getUser>>;
    try {
        verified = await supabaseAuth.auth.getUser(token);
    } catch (error) {
        // Express4 does not observe an async middleware's rejected Promise.
        // SDK errors may look like public AppErrors, and falsey rejection is not
        // an Express error signal. Contain every unexpected rejection here.
        next(buildAuthInfrastructureError(error));
        return;
    }
    const { data, error } = verified;

    // getUser returns known SDK auth errors instead of rejecting. Network/service
    // failures are infrastructure failures; they do not establish an invalid identity.
    if (isAuthRetryableFetchError(error) ||
        (isAuthApiError(error) && error.status >= 500 && error.status <= 599)) {
        next(buildAuthInfrastructureError(error));
        return;
    }

    if (error || !data.user || (expectedUserId && data.user.id !== expectedUserId)) {
        next(buildAuthRequiredError());
        return;
    }

    req.userId = data.user.id;
    req.userEmail = data.user.email ?? null;
    next();
}

function extractBearerToken(authorization: string | undefined): string | null {
    if (!authorization) {
        return null;
    }

    const [scheme, token] = authorization.trim().split(/\s+/, 2);

    if (scheme?.toLowerCase() !== 'bearer' || !token) {
        return null;
    }

    return token;
}

function buildAuthRequiredError(): AppError {
    return new AppError({
        code: 'UNAUTHENTICATED',
        message: 'ログインが必要です。',
        status: 401,
    });
}

function buildAuthInfrastructureError(cause: unknown): AppError {
    return new AppError({ code: 'INTERNAL_SERVER_ERROR', status: 500,
        message: 'サーバー内部エラーが発生しました。', cause });
}
