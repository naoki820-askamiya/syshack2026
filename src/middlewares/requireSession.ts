import type { NextLike, RequestLike, ResponseLike } from "../types/index.ts";
import { AppError } from "../utils/index.ts";

// すべての protected API で、x-session-id があるかだけを確認する middleware です。
// cookie や body ではなくヘッダーに限定することで、セッションの受け取り方を 1 つに固定し、
// 実装のぶれや確認漏れを減らします。
export function requireSession(
    req: RequestLike,
    _res: ResponseLike,
    next: NextLike,
): void {
    const rawHeader =
        req.headers?.["x-session-id"] ?? req.headers?.["X-Session-Id"];
    const sessionId = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

    if (!sessionId || !String(sessionId).trim()) {
        next(
            new AppError({
                code: "SESSION_INVALID",
                message: "x-session-id is required",
                status: 401,
            }),
        );
        return;
    }

    req.sessionId = String(sessionId).trim();
    next();
}
