import { useEffect, useState } from 'react';
import { hydrateAnalysis } from '../api/sessionV17';
import { getAnalysis, getConsultation } from '../utils/storage';
import { normalizeAnalysis } from '../utils/analysisViewModel';

export function useHydratedAnalysis(caseId: string | undefined) {
  const [, setRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const consultation = caseId ? getConsultation(caseId) : undefined;
  const view = caseId ? normalizeAnalysis(getAnalysis(caseId)) : null;

  useEffect(() => {
    if (!caseId || (getConsultation(caseId) && normalizeAnalysis(getAnalysis(caseId)))) return;
    let active = true;
    setLoading(true);
    setError('');
    void hydrateAnalysis(caseId)
      .then((found) => {
        if (!active) return;
        if (!found) setError('この相談の分析結果はまだありません。');
        setRevision((value) => value + 1);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : '分析結果を取得できませんでした。');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [caseId]);

  return { consultation, view, loading, error };
}
