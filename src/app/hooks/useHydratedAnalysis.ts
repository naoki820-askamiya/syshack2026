import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { analyze, hydrateAnalysis } from '../api/sessionV17';
import { fetchApiJson } from '../api/client';
import { getAnalysis, getConsultation } from '../utils/storage';
import { normalizeAnalysis } from '../utils/analysisViewModel';
import { ensureSavedCaseAnalysis, type SavedAnalysisStatus } from '../utils/analysisRetry';
import { assertCurrentAuthBoundary, captureAuthBoundary, isCurrentAuthBoundary } from '../utils/authBoundary';

export function useHydratedAnalysis(caseId: string | undefined) {
  const location = useLocation();
  const navigate = useNavigate();
  const { authEpoch } = useAuth();
  const [, setRevision] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [startRequest, setStartRequest] = useState({ caseId, allowStart: !!(location.state as { startAnalysis?: boolean } | null)?.startAnalysis });
  const [loading, setLoading] = useState(!!caseId && !normalizeAnalysis(getAnalysis(caseId)));
  const [status, setStatus] = useState<SavedAnalysisStatus | null>(null);
  const [error, setError] = useState('');
  const consultation = caseId ? getConsultation(caseId) : undefined;
  const view = caseId ? normalizeAnalysis(getAnalysis(caseId)) : null;

  // Consume the navigation intent separately so replace navigation does not restart the analysis effect.
  useEffect(() => {
    const state = location.state as Record<string, unknown> | null;
    if (!state || typeof state !== 'object' || !state.startAnalysis) return;
    const remaining = { ...state };
    delete remaining.startAnalysis;
    navigate({ pathname: location.pathname, search: location.search, hash: location.hash }, {
      replace: true, state: Object.keys(remaining).length ? remaining : null,
    });
  }, [location.state, location.pathname, location.search, location.hash, navigate]);

  useEffect(() => {
    if (!caseId || (getConsultation(caseId) && normalizeAnalysis(getAnalysis(caseId)))) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const boundary = captureAuthBoundary();
    const startedAt = performance.now();
    const current = () => active && isCurrentAuthBoundary(boundary);
    const latest = async (id: string) => {
      assertCurrentAuthBoundary(boundary);
      const { result } = await fetchApiJson<{ result: unknown | null }>(`/api/analysis-cases/${id}/results/latest`, { signal: controller.signal });
      assertCurrentAuthBoundary(boundary);
      return result !== null;
    };
    const state = async (id: string): Promise<SavedAnalysisStatus> => {
      assertCurrentAuthBoundary(boundary);
      const { analysisCase } = await fetchApiJson<{ analysisCase: { status: string } }>(`/api/analysis-cases/${id}`, { signal: controller.signal });
      assertCurrentAuthBoundary(boundary);
      if (!['draft', 'failed', 'analyzing', 'analyzed'].includes(analysisCase.status)) throw new Error('分析状態を確認できませんでした。');
      if (current()) setStatus(analysisCase.status as SavedAnalysisStatus);
      return analysisCase.status as SavedAnalysisStatus;
    };
    const check = async (start: boolean) => {
      setLoading(true);
      setError('');
      try {
        const next = await ensureSavedCaseAnalysis(caseId, { latest, state, start: async (id) => {
          assertCurrentAuthBoundary(boundary);
          setStatus('analyzing');
          await analyze(id);
          assertCurrentAuthBoundary(boundary);
        } }, start);
        if (!current()) return;
        setStatus(next);
        if (next === 'analyzed') {
          if (!(getConsultation(caseId) && normalizeAnalysis(getAnalysis(caseId)))) await hydrateAnalysis(caseId);
          if (current()) setRevision(v => v + 1);
        } else if (next === 'analyzing' && performance.now() - startedAt < 120_000) {
          timer = setTimeout(() => { if (current()) void check(false); }, 2_000);
        }
      } catch (cause: unknown) {
        if (current()) setError(cause instanceof Error ? cause.message : '分析状態を取得できませんでした。');
      } finally {
        if (current()) setLoading(false);
      }
    };
    void check(startRequest.caseId === caseId && startRequest.allowStart);
    return () => { active = false; controller.abort(); if (timer !== undefined) clearTimeout(timer); };
  }, [caseId, authEpoch, attempt, startRequest]);

  const retry = () => { setStartRequest({ caseId, allowStart: true }); setAttempt(v => v + 1); };
  return { consultation, view, loading, error, status, retry };
}
