import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router';
import { LegalLinks } from '../components/LegalLinks';
import { dataHandlingNotice, legalDraftNotice } from '../legal/documents';
import { safeLegalReturnTo } from '../../shared/legal';
import { recordConsent } from '../api/consentV17';
import { captureAuthBoundary, isCurrentAuthBoundary } from '../utils/authBoundary';

export function Consent() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);
  const lifetime = useRef<object | null>(null);
  useEffect(() => {
    lifetime.current = {};
    return () => { lifetime.current = null; };
  }, []);
  const submit = async () => {
    if (!accepted || busy.current) return;
    const boundary = captureAuthBoundary();
    const owner = lifetime.current;
    const active = () => owner !== null && lifetime.current === owner && isCurrentAuthBoundary(boundary);
    busy.current = true; setSaving(true); setError('');
    try {
      await recordConsent();
      if (active()) navigate(safeLegalReturnTo(params.get('returnTo')), { replace: true });
    } catch (cause) {
      if (active()) setError(cause instanceof Error ? cause.message : '確認内容を保存できませんでした。');
    } finally { busy.current = false; if (active()) setSaving(false); }
  };
  return <div className="min-h-screen bg-[#F7F9FC] p-4 py-8"><main aria-busy={saving} className="analysis-reading mx-auto max-w-xl space-y-5 rounded-2xl border bg-white p-6">
    <h1 className="text-xl font-semibold">相談を始める前の確認</h1>
    <p className="text-sm text-[#5B6573]">初めて利用する方と、利用規約・プライバシーポリシーの更新後にまだ同意していない方にお願いしています。一度同意した版では、毎回の確認は不要です。</p>
    <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{legalDraftNotice}</p>
    <p>{dataHandlingNotice}</p>
    <p className="text-sm text-[#5B6573]">過去情報の利用はプライバシー設定で変更できます。利用をOFFにしても、保存済みの相談は削除されません。</p>
    <LegalLinks />
    <label htmlFor="consultation-legal-consent" className="flex items-start gap-3 rounded-xl border p-4"><input id="consultation-legal-consent" autoComplete="off" type="checkbox" disabled={saving} checked={accepted} onChange={event => setAccepted(event.target.checked)} className="mt-1 h-5 w-5 shrink-0" /><span>利用規約（ドラフト）とプライバシーポリシーに同意します。</span></label>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {saving && <p role="status">確認内容を保存しています…</p>}
    <button type="button" disabled={!accepted || saving} onClick={() => void submit()} className="min-h-12 w-full rounded-xl bg-[#0F4C81] p-3 text-white disabled:opacity-50">{saving ? '保存中…' : '同意して進む'}</button>
    <Link to="/" className="block text-[#0F4C81] underline">ホームへ戻る</Link>
  </main></div>;
}
