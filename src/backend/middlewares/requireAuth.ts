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

    const { data, error } = await supabaseAuth.auth.getUser(token);

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
        code: 'AUTH_REQUIRED',
        message: 'ログインが必要です。',
        status: 401,
    });
}
