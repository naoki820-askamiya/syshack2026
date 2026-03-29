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
import type { NextLike, RequestLike, ResponseLike } from "../types/index.js";
import { getValidSessionOrThrow } from "../services/sessions.service.js";
import { buildSessionInvalidError } from "../utils/index.js";

// すべての protected API で、X-Session-Id が有効かどうかを確認する middleware です。
// ヘッダーがあるだけでは足りず、
// 「実在する session か」「期限切れでないか」までここで確認します。
export async function requireSession(
    req: RequestLike,
    _res: ResponseLike,
    next: NextLike,
): Promise<void> {
    // Node/Express 側ではヘッダー名が小文字化されるので、
    // 実装上は `x-session-id` だけを見れば十分です。
    const rawHeader = req.headers?.["x-session-id"];
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
