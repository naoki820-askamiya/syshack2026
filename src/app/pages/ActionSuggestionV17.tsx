import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { AlertTriangle, ArrowLeft, CheckCircle2, Copy, MessageSquare, XCircle } from 'lucide-react';
import { Navigation } from '../components/Navigation';
import { getAnalysis, getConsultation } from '../utils/storage';
import { normalizeAnalysis } from '../utils/analysisViewModel';

const TONES = {
  formal: { label: '丁寧', className: 'bg-[#E8F1F8] text-[#0F4C81]' },
  normal: { label: 'ふつう', className: 'bg-[#F1F4F8] text-[#5B6573]' },
  light: { label: '軽め', className: 'bg-green-50 text-green-700' },
};

export function ActionSuggestionV17() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [copied, setCopied] = useState<number | null>(null);
  const consultation = id ? getConsultation(id) : undefined;
  const view = id ? normalizeAnalysis(getAnalysis(id)) : null;

  if (!consultation || !view) {
    return (
      <div className="min-h-screen bg-[#F7F9FC] flex items-center justify-center text-center">
        <div><p className="mb-4 text-[#5B6573]">提案データが見つかりません</p>
          <button onClick={() => navigate('/')} className="font-medium text-[#0F4C81]">ホームに戻る</button></div>
      </div>
    );
  }

  const copy = async (value: string, index: number) => {
    await navigator.clipboard.writeText(value);
    setCopied(index);
    window.setTimeout(() => setCopied(null), 1800);
  };

  return (
    <div className="min-h-screen bg-[#F7F9FC]">
      <Navigation />
      <div className="lg:ml-64 pb-24 lg:pb-8">
        <div className="sticky top-0 z-10 border-b border-[#D9E1EA] bg-white p-4 lg:px-8">
          <div className="mx-auto flex max-w-5xl items-center gap-3">
            <button onClick={() => navigate(-1)} aria-label="戻る" className="text-[#5B6573]"><ArrowLeft className="h-6 w-6" /></button>
            <h1 className="text-xl font-semibold lg:text-2xl">行動提案</h1>
          </div>
        </div>

        <main className="mx-auto max-w-5xl space-y-5 p-4 lg:p-8">
          <section className="rounded-2xl border border-[#D9E1EA] bg-white p-5 shadow-sm">
            <p className="text-xs text-[#5B6573]">{consultation.personName}さんとの状況</p>
            <h2 className="mt-1 text-lg font-semibold text-[#1F2A37]">{view.summary}</h2>
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <ListCard
              icon={<CheckCircle2 className="h-4 w-4 text-green-600" />}
              title="推奨アクション"
              items={view.recommendedActions}
              color="green"
            />
            <ListCard
              icon={<AlertTriangle className="h-4 w-4 text-red-600" />}
              title="避けるべき行動"
              items={view.avoidActions}
              color="red"
            />
          </div>

          {view.possibleBiases.length > 0 && (
            <section className="rounded-2xl border border-[#D9E1EA] bg-white p-5 shadow-sm">
              <h2 className="font-semibold text-[#1F2A37]">考え方の偏りかもしれない点</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {view.possibleBiases.map((item, index) => (
                  <div key={`${item.label}-${index}`} className="rounded-xl bg-[#F7F9FC] p-3">
                    <p className="text-sm font-medium text-[#1F2A37]">{item.label}</p>
                    <p className="mt-1 text-sm text-[#5B6573]">{item.basis}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-[#D9E1EA] bg-white p-5 shadow-sm">
            <div className="mb-2 flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-[#0F4C81]" />
              <h2 className="font-semibold text-[#1F2A37]">返信案</h2>
            </div>
            <p className="mb-4 text-xs text-[#5B6573]">相手や状況に合わせて、自分の言葉へ調整してから使ってください。</p>
            {view.replyDrafts.length > 0 ? (
              <div className="space-y-3">
                {view.replyDrafts.map((draft, index) => (
                  <div key={`${draft.tone}-${index}`} className="rounded-xl border border-[#D9E1EA] bg-[#F7F9FC] p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${TONES[draft.tone].className}`}>{TONES[draft.tone].label}</span>
                      <button onClick={() => void copy(draft.text, index)} className="flex items-center gap-1 text-xs font-medium text-[#0F4C81]">
                        {copied === index ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                        {copied === index ? 'コピー済み' : 'コピー'}
                      </button>
                    </div>
                    <p className="text-sm leading-relaxed text-[#1F2A37]">{draft.text}</p>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-[#8A94A6]">この分析には返信案がありません。</p>}
          </section>

          <section className="rounded-xl border border-[#D9E1EA] bg-white p-4 text-sm text-[#5B6573]">
            <strong className="text-[#1F2A37]">注意：</strong> {view.disclaimer}
          </section>

          <div className="grid gap-3 sm:grid-cols-2">
            <button onClick={() => navigate(`/analysis/${consultation.id}`)} className="flex items-center justify-center gap-2 rounded-xl border-2 border-[#D9E1EA] bg-white py-3 font-medium text-[#0F4C81]">
              <ArrowLeft className="h-4 w-4" />分析結果に戻る
            </button>
            <button onClick={() => navigate('/')} className="rounded-xl bg-[#0F4C81] py-3 font-semibold text-white">完了</button>
          </div>
        </main>
      </div>
    </div>
  );
}

function ListCard({ icon, title, items, color }: {
  icon: React.ReactNode;
  title: string;
  items: { label: string; reason: string }[];
  color: 'green' | 'red';
}) {
  const background = color === 'green' ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100';
  return (
    <section className="rounded-2xl border border-[#D9E1EA] bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">{icon}<h2 className="font-semibold text-[#1F2A37]">{title}</h2></div>
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={`${item.label}-${index}`} className={`rounded-xl border p-3 ${background}`}>
            <p className="flex gap-2 text-sm font-medium text-[#1F2A37]">
              {color === 'green' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
              {item.label}
            </p>
            {item.reason && <p className="mt-1 pl-6 text-xs text-[#5B6573]">{item.reason}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}
