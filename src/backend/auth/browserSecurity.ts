import type { Request, Response, NextFunction } from 'express';
import { AppError, readEnv } from '../utils/index.js';

export function allowedBrowserOrigins(): string[] {
    const configured = readEnv('ALLOWED_ORIGINS') ?? readEnv('FRONTEND_ORIGIN');
    const values = configured?.split(',').map(value => value.trim()).filter(Boolean) ??
        ['http://localhost:5173', 'http://127.0.0.1:5173', 'https://kigen404.vercel.app', 'https://syshack2026.vercel.app'];
    return values.filter(value => {
        try { const url = new URL(value); return url.origin === value && ['https:', 'http:'].includes(url.protocol); }
        catch { return false; }
    });
}

export function verifyBrowserMutation(headers: Record<string, string | string[] | undefined>): string {
    const origin = headers.origin;
    if (typeof origin !== 'string' || !allowedBrowserOrigins().includes(origin) || headers['x-kigen-csrf'] !== '1') {
        throw new AppError({ code: 'CSRF_REJECTED', status: 403, message: '操作元を確認できませんでした。画面を開き直してください。' });
    }
    // Plain HTTP cookies are exclusively a local development option.
    if (readEnv('AUTH_COOKIE_SECURE') === 'false' && !/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin)) {
        throw new Error('非HTTPSの認証Cookieはローカル開発に限定されます。');
    }
    if (headers['sec-fetch-site'] === 'cross-site') {
        throw new AppError({ code: 'CSRF_REJECTED', status: 403, message: '同じサイトから操作してください。' });
    }
    return origin;
}

export function browserMutation(req: Request, _res: Response, next: NextFunction) {
    try {
        verifyBrowserMutation(req.headers);
        if (!req.is('application/json')) throw new AppError({ code: 'INVALID_CONTENT_TYPE', status: 415, message: 'JSON形式で送信してください。' });
        next();
    } catch (error) { next(error); }
}

// Supplement Supabase's provider-side limits. Bounded, process-local counters;
// proxy headers are never trusted to manufacture a client IP.
export function authRateLimit(now = Date.now) {
    const buckets = new Map<string, { count: number; until: number }>();
    return (req: Request, res: Response, next: NextFunction) => {
        const time = now();
        for (const [key, bucket] of buckets) if (bucket.until <= time) buckets.delete(key);
        const key = `${req.ip}:${req.path === '/session' ? 'session' : 'credentials'}`;
        let bucket = buckets.get(key);
        if (!bucket && buckets.size < 10_000) {
            bucket = { count: 0, until: time + 10 * 60_000 }; buckets.set(key, bucket);
        }
        if (!bucket || ++bucket.count > (req.path === '/session' ? 120 : 20)) {
            res.setHeader('Retry-After', '600');
            next(new AppError({ code: 'AUTH_RATE_LIMITED', status: 429, message: '操作が多すぎます。時間をおいて再試行してください。' }));
        } else next();
    };
}
