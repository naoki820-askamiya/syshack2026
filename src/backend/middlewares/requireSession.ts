/**
 * このファイルは session チェック用の middleware です。
 *
 * middleware とは:
 * - route と controller の間などで、共通処理を途中ではさむ仕組み
 *
 * この middleware の役割は、
 * 「この API を使う人が、どの session なのか」を
 * `X-Session-Id` ヘッダーから確認することです。
 */
import type { NextLike, RequestLike, ResponseLike } from "../types/index.ts";
import { getValidSessionOrThrow } from "../services/sessions.service.ts";
import { AppError } from "../utils/index.ts";

// すべての protected API で、X-Session-Id が有効かどうかを確認する middleware です。
// ヘッダーがあるだけでは足りず、
// 「実在する session か」「期限切れでないか」までここで確認します。
export async function requireSession(
    req: RequestLike,
    _res: ResponseLike,
    next: NextLike,
): Promise<void> {
    // ヘッダー名の大文字小文字の揺れを吸収しつつ読み取ります。
    const rawHeader =
        req.headers?.["x-session-id"] ?? req.headers?.["X-Session-Id"];
    const sessionId = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

    // session が無いと、どの人のデータなのか区別できません。
    // そのため protected API では先にここで止めます。
    if (!sessionId || !String(sessionId).trim()) {
        next(buildSessionInvalidError());
        return;
    }

    try {
        // sessionId が本当に存在し、期限切れでないかを service で確認します。
        const normalizedSessionId = String(sessionId).trim();
        await getValidSessionOrThrow(normalizedSessionId);

        // 以降の controller / service で使いやすいように、
        // 正規化した sessionId を request に入れて次へ渡します。
        req.sessionId = normalizedSessionId;
        next();
    } catch (error) {
        next(error);
    }
}

function buildSessionInvalidError() {
    return new AppError({
        code: "SESSION_INVALID",
        message: "session が無効または期限切れです。",
        status: 401,
    });
}
