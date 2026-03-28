/**
 * このファイルは sessions の service です。
 *
 * service の役割:
 * - session を新しく発行する
 * - session が有効かどうかを判定する
 *
 * 今回の session は MVP 用の簡易実装なので、
 * ログインや cookie ではなく、API で作った sessionId を
 * `X-Session-Id` ヘッダーに入れて使います。
 */
import { randomBytes } from "node:crypto";
import * as sessionsRepository from "../repositories/sessions.repository.ts";
import type { StoredSession } from "../types/index.ts";
import { buildSessionInvalidError } from "../utils/index.ts";

const SESSION_TTL_HOURS = 24;

/**
 * 新しい session を 1 件作ります。
 *
 * 返すもの:
 * - 仕様書に寄せた `sessionId / expiresAt`
 * - 後方互換のための `session`
 *
 * expiresAt は作成時点から 24 時間後にしています。
 */
export async function createSession() {
    const now = new Date();
    const createdAt = now.toISOString();
    const expiresAt = new Date(
        now.getTime() + SESSION_TTL_HOURS * 60 * 60 * 1000,
    ).toISOString();

    const session: StoredSession = {
        id: buildSessionId(),
        expiresAt,
        createdAt,
        updatedAt: createdAt,
    };

    await sessionsRepository.create(session);

    return {
        sessionId: session.id,
        expiresAt: session.expiresAt,
        // 既存の参照先を壊さないため、旧 shape も残します。
        session,
    };
}

/**
 * sessionId が実在し、かつ期限切れでないことを確認します。
 *
 * 無効な場合は `SESSION_INVALID (401)` を投げます。
 * `requireSession` middleware からも使うため、共通化しています。
 */
export async function getValidSessionOrThrow(
    sessionId: string,
): Promise<StoredSession> {
    if (!sessionId.trim()) {
        throw buildSessionInvalidError();
    }

    const session = await sessionsRepository.findById(sessionId);

    if (!session) {
        throw buildSessionInvalidError();
    }

    if (new Date(session.expiresAt).getTime() <= Date.now()) {
        throw buildSessionInvalidError();
    }

    return session;
}

function buildSessionId(): string {
    return `sess_${randomBytes(24).toString("hex")}`;
}
