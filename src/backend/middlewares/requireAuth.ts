import type { NextLike, RequestLike, ResponseLike } from '../types/index.js';
import { supabaseAuth } from '../auth/supabase.js';
import { AppError } from '../utils/index.js';

export async function requireAuth(
    req: RequestLike,
    _res: ResponseLike,
    next: NextLike,
): Promise<void> {
    const rawHeader = req.headers?.authorization ?? req.headers?.Authorization;
    const authorization = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
    const token = extractBearerToken(authorization);

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
        next(new AppError({ code: 'INTERNAL_SERVER_ERROR', status: 500,
            message: 'サーバー内部エラーが発生しました。', cause: error }));
        return;
    }
    const { data, error } = verified;

    if (error || !data.user) {
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
