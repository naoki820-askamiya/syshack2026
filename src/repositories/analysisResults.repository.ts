import type { StoredAnalysisResult } from "../types/index.ts";

const analysisResults = new Map<string, StoredAnalysisResult>();

export async function upsert(
    input: Omit<StoredAnalysisResult, "id" | "createdAt" | "updatedAt">,
): Promise<StoredAnalysisResult> {
    const existing = analysisResults.get(input.analysisCaseId);
    const now = new Date().toISOString();

    const record: StoredAnalysisResult = existing
        ? {
              ...existing,
              result: input.result,
              updatedAt: now,
          }
        : {
              id: `result_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              analysisCaseId: input.analysisCaseId,
              result: input.result,
              createdAt: now,
              updatedAt: now,
          };

    analysisResults.set(input.analysisCaseId, record);
    return record;
}

export async function findByCaseId(
    caseId: string,
): Promise<StoredAnalysisResult | null> {
    return analysisResults.get(caseId) ?? null;
}
