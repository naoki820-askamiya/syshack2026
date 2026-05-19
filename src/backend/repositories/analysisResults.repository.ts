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
import { supabase } from "../lib/supabase.js";

/**
 * 分析結果を保存します。
 *
 * 同じ caseId の結果がすでにある場合は更新し、
 * まだ無い場合は新しく作ります。
 *
 * この「あるなら更新、無いなら作成」を upsert と呼びます。
 */
export async function create(
    input: Omit<StoredAnalysisResult, "id" | "createdAt">,
): Promise<StoredAnalysisResult> {
    const { data, error } = await supabase
        .from("analysis_results")
        .insert({
            user_id: input.userId,
            analysis_case_id: input.analysisCaseId,
            analyze_run_id: input.analyzeRunId,
            version: input.version,
            prompt_version: input.promptVersion,
            result_schema_version: input.resultSchemaVersion,
            model: input.model,
            result_json: input.resultJson,
        })
        .select()
        .single();

    if (error) {
        throw error;
    }

    return toStoredAnalysisResult(data);
}

/**
 * caseId にひも付く分析結果を 1 件取り出します。
 * 見つからないときは `null` を返します。
 */
export async function findLatestByCaseId(
    userId: string,
    caseId: string
): Promise<StoredAnalysisResult | null> {
    const { data, error } = await supabase
        .from("analysis_results")
        .select("*")
        .eq("user_id", userId)
        .eq("analysis_case_id", caseId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        throw error;
    }

    if (!data) {
        return null;
    }

    return toStoredAnalysisResult(data);

}

function toStoredAnalysisResult(row: any): StoredAnalysisResult {
    return {
        id: row.id,
        userId: row.user_id,
        analysisCaseId: row.analysis_case_id,
        analyzeRunId: row.analyze_run_id,
        version: row.version,
        promptVersion: row.prompt_version,
        resultSchemaVersion: row.result_schema_version,
        model: row.model,
        resultJson: row.result_json,
        createdAt: row.created_at,
    };
}