export type SavedAnalysisStatus = 'draft' | 'failed' | 'analyzing' | 'analyzed';
export interface SavedCaseAnalysisOperations {
  latest: (caseId: string) => Promise<boolean>;
  state: (caseId: string) => Promise<SavedAnalysisStatus>;
  start: (caseId: string) => Promise<void>;
}

export async function ensureSavedCaseAnalysis(
  caseId: string, operations: SavedCaseAnalysisOperations, allowStart: boolean,
): Promise<SavedAnalysisStatus> {
  if (await operations.latest(caseId)) return 'analyzed';
  const state = await operations.state(caseId);
  if (state === 'analyzing') return state;
  if (state === 'analyzed') throw new Error('分析済みですが結果を取得できませんでした。状態を再取得してください。');
  if (!allowStart) return state;
  try {
    await operations.start(caseId);
    return 'analyzed';
  } catch (error) {
    // An HTTP failure does not prove the server failed. Reconcile before any resend.
    if (await operations.latest(caseId)) return 'analyzed';
    if (await operations.state(caseId) === 'analyzing') return 'analyzing';
    throw error;
  }
}
