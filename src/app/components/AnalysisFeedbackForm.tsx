import { useEffect, useId, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { getFeedback, submitFeedback, updateFeedback } from '../api/preferencesV17';
import { feedbackInput, saveLoadedFeedback, type FeedbackInput, type SavedFeedback } from '../utils/feedbackModel';
import { captureAuthBoundary, isCurrentAuthBoundary } from '../utils/authBoundary';

export function AnalysisFeedbackForm({ resultId }: { resultId: string }) {
  const noteId = useId();
  const resultRef = useRef(resultId);
  resultRef.current = resultId;
  const preserveDraft = useRef(false);
  const [existing, setExisting] = useState<SavedFeedback | null | undefined>(undefined);
  const [draft, setDraft] = useState<FeedbackInput>(() => feedbackInput(null));
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const boundary = captureAuthBoundary();
    const keepUnsavedDraft = preserveDraft.current && loadedFor === resultId;
    setLoadState('loading');
    setSending(false);
    setExisting(undefined);
    setError('');
    setMessage('');
    void getFeedback(resultId)
      .then(({ feedback }) => {
        if (!active || !isCurrentAuthBoundary(boundary)) return;
        setExisting(feedback);
        if (feedback || !keepUnsavedDraft) setDraft(feedbackInput(feedback));
        preserveDraft.current = false;
        setLoadedFor(resultId);
        setLoadState('ready');
      })
      .catch((cause: unknown) => {
        if (!active || !isCurrentAuthBoundary(boundary)) return;
        setLoadState('error');
        setError(cause instanceof Error ? cause.message : 'Feedbackを取得できませんでした。');
      });
    return () => { active = false; };
  }, [resultId, loadAttempt]);

  const ready = loadState === 'ready' && loadedFor === resultId;
  const send = async () => {
    if (!ready || sending) return;
    const boundary = captureAuthBoundary();
    const submittedResultId = resultId;
    setSending(true);
    setMessage('');
    setError('');
    try {
      const { feedback } = await saveLoadedFeedback(resultId, existing, {
        ...draft, outcomeNote: draft.outcomeNote?.trim() || null,
      }, { create: submitFeedback, update: updateFeedback });
      if (!isCurrentAuthBoundary(boundary) || resultRef.current !== submittedResultId) return;
      setExisting(feedback);
      setDraft(feedbackInput(feedback));
      setMessage('Feedbackを保存しました。後から編集や利用許可の撤回ができます。');
    } catch (cause) {
      if (!isCurrentAuthBoundary(boundary) || resultRef.current !== submittedResultId) return;
      // A lost response may follow a successful POST. Re-read before choosing POST/PATCH again.
      preserveDraft.current = true;
      setExisting(undefined);
      setLoadState('error');
      setError(cause instanceof Error ? cause.message : 'Feedbackを保存できませんでした。');
    } finally {
      if (isCurrentAuthBoundary(boundary) && resultRef.current === submittedResultId) setSending(false);
    }
  };

  return (
    <section className="rounded-2xl border border-[#D9E1EA] bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-[#1F2A37]">この分析へのFeedback</h2>
      <p className="mt-1 text-xs text-[#5B6573]">Feedbackは正解ラベルではなく、今後の状況整理の参考情報として扱います。</p>
      {loadState === 'loading' || loadedFor !== resultId && loadState !== 'error' ? (
        <p role="status" className="mt-4 text-sm text-[#5B6573]">保存済みFeedbackを確認しています…</p>
      ) : loadState === 'error' ? (
        <div role="alert" className="mt-4 text-sm text-red-700">
          <p>{error}</p>
          <button type="button" onClick={() => setLoadAttempt((value) => value + 1)} className="mt-2 font-medium underline">Feedbackを再取得</button>
        </div>
      ) : (
        <>
          <fieldset disabled={sending} className="mt-4">
            <legend className="sr-only">Feedbackの確認・編集</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <ScorePicker label="役に立った度合い" low="役に立たなかった" high="とても役に立った" value={draft.helpfulnessScore} onChange={(score) => setDraft((current) => ({ ...current, helpfulnessScore: score }))} />
              <ScorePicker label="読みすぎだと感じた度合い" low="読みすぎではない" high="かなり読みすぎ" value={draft.overreadScore} onChange={(score) => setDraft((current) => ({ ...current, overreadScore: score }))} />
            </div>
            <label htmlFor={noteId} className="mt-4 block text-sm font-medium text-[#1F2A37]">その後の振り返り（任意）</label>
            <textarea
              id={noteId}
              value={draft.outcomeNote ?? ''}
              onChange={(event) => setDraft((current) => ({ ...current, outcomeNote: event.target.value }))}
              maxLength={1000}
              rows={3}
              className="mt-2 w-full rounded-xl border border-[#D9E1EA] p-3 text-sm outline-none focus:border-[#0F4C81]"
              placeholder="その後どうなったか、違っていた点など"
            />
            <label className="mt-3 flex items-start gap-2 text-sm text-[#5B6573]">
              <input type="checkbox" checked={draft.allowPersonalizationUse} onChange={(event) => setDraft((current) => ({ ...current, allowPersonalizationUse: event.target.checked }))} className="mt-1 h-5 w-5 shrink-0 accent-[#0F4C81]" />
              このFeedbackを次回のパーソナライズ分析に利用してよい
            </label>
            <p className="mt-1 text-xs text-[#5B6573]">OFFにして保存すると、次回の分析文脈への利用を撤回できます。</p>
          </fieldset>
          {message && <p role="status" className="mt-3 text-sm text-green-800">{message}</p>}
          <button
            onClick={() => void send()}
            disabled={!ready || sending}
            className="mt-4 flex min-h-12 items-center gap-2 rounded-lg bg-[#0F4C81] px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            <Send className="h-4 w-4" />{sending ? '保存中…' : existing ? 'Feedbackを更新' : 'Feedbackを保存'}
          </button>
        </>
      )}
    </section>
  );
}

function ScorePicker({ label, low, high, value, onChange }: { label: string; low: string; high: string; value: number | null; onChange: (score: number | null) => void }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-[#1F2A37]">{label}</legend>
      <div className="flex max-w-72 gap-1.5">
        {[1, 2, 3, 4, 5].map((score) => (
          <button
            key={score}
            type="button"
            onClick={() => onChange(value === score ? null : score)}
            aria-pressed={value === score}
            className={`h-12 min-w-11 flex-1 rounded-lg border text-base ${value === score ? 'border-[#0F4C81] bg-[#E8F1F8] font-semibold text-[#0F4C81]' : 'border-[#D9E1EA] text-[#5B6573]'}`}
          >{score}</button>
        ))}
      </div>
      <p className="mt-2 flex max-w-72 justify-between gap-3 text-xs text-[#5B6573]"><span>1：{low}</span><span>5：{high}</span></p>
      <p className="mt-1 text-xs text-[#5B6573]">選んだ数字をもう一度押すと未選択に戻ります。</p>
    </fieldset>
  );
}
