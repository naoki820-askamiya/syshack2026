import type { NextLike, RequestLike, ResponseLike } from "../types/index.ts";
import { normalizeError, toErrorResponse } from "../utils/index.ts";

// どの層で起きたエラーでも、最後は同じ JSON 形式で返すための middleware です。
// 返却形式をここで統一しておくと、AI 層・service 層・middleware 層で投げ方が違っても、
// クライアント側は常に { error: { code, message, status } } を前提に扱えます。
export function errorHandler(
    error: unknown,
    _req: RequestLike,
    res: ResponseLike,
    _next: NextLike,
): unknown {
    const normalized = normalizeError(error);
    const body = toErrorResponse(normalized);

    if (typeof res.status === "function") {
        return res.status(normalized.status).json?.(body);
    }

    res.statusCode = normalized.status;
    res.body = body;
    return body;
}
