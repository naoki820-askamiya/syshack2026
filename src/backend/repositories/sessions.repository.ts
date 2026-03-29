/**
 * このファイルは sessions の repository です。
 *
 * 役割:
 * - session の保存
 * - sessionId での取得
 *
 * 今は DB ではなく、`Map` を使ったインメモリ実装です。
 * そのため、サーバーを再起動すると session は消えます。
 */
import type { StoredSession } from "../types/index.js";

const sessions = new Map<string, StoredSession>();

/**
 * 新しい session を保存します。
 *
 * 受け取るもの:
 * - id と日時を含んだ完全な session データ
 *
 * 返すもの:
 * - 保存した session
 */
export async function create(session: StoredSession): Promise<StoredSession> {
    sessions.set(session.id, session);
    return session;
}

/**
 * sessionId から session を 1 件取り出します。
 * 見つからないときは `null` を返します。
 */
export async function findById(sessionId: string): Promise<StoredSession | null> {
    return sessions.get(sessionId) ?? null;
}
