/**
 * このファイルは persons の repository です。
 *
 * Person データの保存・取得だけを担当します。
 * 今はハッカソン向けの簡易実装なので、DB ではなく `Map` を使っています。
 *
 * 注意:
 * - サーバーを再起動するとデータは消えます
 * - 本番向けではなく、MVP を素早く動かすための形です
 */
import type { StoredPerson } from "../types/index.js";

// `person.id` をキーにして Person を保存します。
// `Map` は「ID で素早く探したい」ときに分かりやすい入れ物です。
const persons = new Map<string, StoredPerson>();

/**
 * 新しい Person を保存します。
 *
 * 受け取るもの:
 * - id と日時以外の Person データ
 *
 * 返すもの:
 * - 保存後の完全な Person データ
 */
export async function create(
    input: Omit<StoredPerson, "id" | "createdAt" | "updatedAt">,
): Promise<StoredPerson> {
    const now = new Date().toISOString();
    const created: StoredPerson = {
        id: `person_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        createdAt: now,
        updatedAt: now,
        ...input,
    };

    persons.set(created.id, created);
    return created;
}

/**
 * personId で Person を 1 件探します。
 * 見つからないときは `null` を返します。
 */
export async function findById(personId: string): Promise<StoredPerson | null> {
    return persons.get(personId) ?? null;
}
