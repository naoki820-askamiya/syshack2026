/**
 * このファイルは analysis-cases の repository です。
 *
 * repository とは:
 * - データの保存・取得を担当する場所
 *
 * 今回はハッカソン用の簡易実装として、
 * 本物の DB ではなく `Map` を使ったインメモリ実装にしています。
 *
 * インメモリ実装とは:
 * - データをメモリ上だけに持つ形
 * - サーバーを再起動すると消える
 *
 * `Map` を使う理由:
 * - `id` をキーにして素早く取り出しやすいからです
 */
import type { PaginationOptions, StoredAnalysisCase } from "../types/index.js";

const analysisCases = new Map<string, StoredAnalysisCase>();

/**
 * 新しい analysis-case を保存します。
 *
 * 受け取るもの:
 * - id と日時以外の analysis-case データ
 *
 * 返すもの:
 * - 保存後の完全な analysis-case データ
 */
export async function create(
    input: Omit<StoredAnalysisCase, "id" | "createdAt" | "updatedAt">,
): Promise<StoredAnalysisCase> {
    const now = new Date().toISOString();
    const created: StoredAnalysisCase = {
        id: `case_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        createdAt: now,
        updatedAt: now,
        ...input,
    };

    analysisCases.set(created.id, created);
    return created;
}

/**
 * caseId を使って 1 件の analysis-case を取り出します。
 * 無いときは `null` を返します。
 */
export async function findById(
    caseId: string,
): Promise<StoredAnalysisCase | null> {
    return analysisCases.get(caseId) ?? null;
}

/**
 * status だけを更新する関数です。
 *
 * `draft` → `analyzing` → `analyzed/error`
 * のような流れで呼ばれます。
 */
export async function updateStatus(
    caseId: string,
    status: StoredAnalysisCase["status"],
): Promise<StoredAnalysisCase | null> {
    const existing = analysisCases.get(caseId);
    if (!existing) {
        return null;
    }

    const updated: StoredAnalysisCase = {
        ...existing,
        status,
        updatedAt: new Date().toISOString(),
    };

    analysisCases.set(caseId, updated);
    return updated;
}

/**
 * 特定の Person にひも付く analysis-case 一覧を返します。
 *
 * `limit` と `offset` はページング用です。
 * たくさん増えたときでも、少しずつ読めるようにしています。
 */
export async function findByPersonId(
    sessionId: string,
    personId: string,
    options: PaginationOptions,
) {
    const list = Array.from(analysisCases.values())
        .filter(
            (item) =>
                item.sessionId === sessionId && item.personId === personId,
        )
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    const sliced = list.slice(options.offset, options.offset + options.limit);

    return {
        analysisCases: sliced,
        pagination: {
            hasMore: list.length > options.offset + options.limit,
            limit: options.limit,
            offset: options.offset,
        },
    };
}
