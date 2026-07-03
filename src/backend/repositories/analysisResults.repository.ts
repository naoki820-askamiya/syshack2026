/**
 * このファイルは analysis 結果の repository です。
 *
 * ここも DB ではなく、`Map` を使ったインメモリ実装です。
 * つまり、サーバーを再起動すると保存内容は消えます。
 *
 * 役割はシンプルで、
 * - AI の結果を保存する
 * - caseId から保存済み結果を取り出す
 * の 2 つです。
 */
import type { StoredAnalysisResult } from "../types/index.js";

const analysisResults = new Map<string, StoredAnalysisResult>();

/**
 * 分析結果を保存します。
 *
 * 同じ caseId の結果がすでにある場合は更新し、
 * まだ無い場合は新しく作ります。
 *
 * この「あるなら更新、無いなら作成」を upsert と呼びます。
 */
export async function upsert(
    input: Omit<StoredAnalysisResult, "id" | "createdAt" | "updatedAt">,
): Promise<StoredAnalysisResult> {
    const existing = analysisResults.get(input.analysisCaseId);
    const now = new Date().toISOString();

    const record: StoredAnalysisResult = existing
        ? {
              ...existing,
              promptVersion: input.promptVersion,
              result: input.result,
              updatedAt: now,
          }
        : {
              id: `result_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              userId: input.userId,
              analysisCaseId: input.analysisCaseId,
              promptVersion: input.promptVersion,
              result: input.result,
              createdAt: now,
              updatedAt: now,
          };

    analysisResults.set(input.analysisCaseId, record);
    return record;
}

/**
 * caseId にひも付く分析結果を 1 件取り出します。
 * 見つからないときは `null` を返します。
 */
export async function findByCaseId(
    userId: string,
    caseId: string,
): Promise<StoredAnalysisResult | null> {
    const result = analysisResults.get(caseId) ?? null;

    if (!result || result.userId !== userId) {
        return null;
    }

    return result;
}
