import { useEffect } from 'react';
import { useBlocker } from 'react-router';

export function IncompleteConsultationGuard({ pending }: { pending: { current: boolean } }) {
  const blocker = useBlocker(() => pending.current);
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm('相談の保存が完了していません。相手の情報だけが保存されている可能性があります。この画面で再試行できます。離れると入力内容は失われます。画面を離れますか？')) blocker.proceed();
    else blocker.reset();
  }, [blocker]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!pending.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [pending]);

  return null;
}
