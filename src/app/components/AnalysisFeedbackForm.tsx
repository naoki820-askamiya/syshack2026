import { useState } from 'react';
import { CheckCircle2, Send } from 'lucide-react';
import { submitFeedback } from '../api/preferencesV17';

export function AnalysisFeedbackForm({ resultId }: { resultId: string }) {
  const [helpfulnessScore, setHelpfulnessScore] = useState<number | null>(null);
  const [overreadScore, setOverreadScore] = useState<number | null>(null);
  const [outcomeNote, setOutcomeNote] = useState('');
  const [allowUse, setAllowUse] = useState(false);
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');

  const send = async () => {
    setState('sending');
    setError('');
    try {
      await submitFeedback(resultId, {
        helpfulnessScore,
        overreadScore,
        outcomeNote: outcomeNote.trim() || null,
        allowPersonalizationUse: allowUse,
      });
      setState('sent');
    } catch (caught) {
      setState('idle');
      setError(caught instanceof Error ? caught.message : 'Feedbackを送信できませんでした。');
    }
  };

  if (state === 'sent') {
    return (
      <section className="flex items-center gap-2 rounded-2xl border border-green-200 bg-green-50 p-5 text-sm text-green-800">
        <CheckCircle2 className="h-5 w-5" />Feedbackを保存しました。
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-[#D9E1EA] bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-[#1F2A37]">この分析へのFeedback</h2>
      <p className="mt-1 text-xs text-[#5B6573]">Feedbackは正解ラベルではなく、今後の状況整理の参考情報として扱います。</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <ScorePicker label="役に立った度合い" value={helpfulnessScore} onChange={setHelpfulnessScore} />
        <ScorePicker label="読みすぎだと感じた度合い" value={overreadScore} onChange={setOverreadScore} />
      </div>
      <textarea
        value={outcomeNote}
        onChange={(event) => setOutcomeNote(event.target.value)}
        maxLength={1000}
        rows={3}
        className="mt-4 w-full rounded-xl border border-[#D9E1EA] p-3 text-sm outline-none focus:border-[#0F4C81]"
        placeholder="任意：その後どうなったか、違っていた点など"
      />
      <label className="mt-3 flex items-start gap-2 text-sm text-[#5B6573]">
        <input type="checkbox" checked={allowUse} onChange={(event) => setAllowUse(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#0F4C81]" />
        このFeedbackを次回のパーソナライズ分析に利用してよい
      </label>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <button
        onClick={() => void send()}
        disabled={state === 'sending'}
        className="mt-4 flex items-center gap-2 rounded-lg bg-[#0F4C81] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        <Send className="h-4 w-4" />{state === 'sending' ? '送信中…' : 'Feedbackを送信'}
      </button>
    </section>
  );
}

function ScorePicker({ label, value, onChange }: { label: string; value: number | null; onChange: (score: number) => void }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-[#1F2A37]">{label}</legend>
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((score) => (
          <button
            key={score}
            type="button"
            onClick={() => onChange(score)}
            aria-pressed={value === score}
            className={`h-9 w-9 rounded-lg border text-sm ${value === score ? 'border-[#0F4C81] bg-[#E8F1F8] font-semibold text-[#0F4C81]' : 'border-[#D9E1EA] text-[#5B6573]'}`}
          >{score}</button>
        ))}
      </div>
    </fieldset>
  );
}
