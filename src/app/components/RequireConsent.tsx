import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { getConsent } from '../api/consentV17';
import { useAuth } from '../auth/AuthContext';
import { captureAuthBoundary, isCurrentAuthBoundary } from '../utils/authBoundary';

export function RequireConsent({ children }: { children: ReactNode }) {
  const { authEpoch } = useAuth();
  const location = useLocation();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ epoch: number; accepted: boolean | null; error: string }>({ epoch: authEpoch, accepted: null, error: '' });
  useEffect(() => {
    const boundary = captureAuthBoundary();
    const controller = new AbortController();
    setState({ epoch: authEpoch, accepted: null, error: '' });
    void getConsent(controller.signal).then(result => {
      if (!controller.signal.aborted && isCurrentAuthBoundary(boundary)) setState({ epoch: authEpoch, accepted: result.accepted, error: '' });
    }).catch(error => {
      if (!controller.signal.aborted && isCurrentAuthBoundary(boundary)) setState({ epoch: authEpoch, accepted: null, error: error instanceof Error ? error.message : '確認状態を取得できませんでした。' });
    });
    return () => controller.abort();
  }, [authEpoch, attempt]);
  if (state.epoch !== authEpoch || state.accepted === null) return <main className="mx-auto max-w-xl space-y-4 p-8">
    {state.epoch === authEpoch && state.error ? <div role="alert"><p>{state.error}</p><button type="button" className="mt-3 text-[#0F4C81] underline" onClick={() => setAttempt(v => v + 1)}>確認状態を再取得</button></div> : <p role="status">規約の確認状態を取得しています…</p>}
  </main>;
  if (!state.accepted) return <Navigate replace to={`/consent?returnTo=${encodeURIComponent(location.pathname + location.search)}`} />;
  return children;
}
