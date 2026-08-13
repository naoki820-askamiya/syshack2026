import { useNavigate, useParams } from 'react-router';
import { AlertCircle, ArrowLeft, ArrowRight, Info } from 'lucide-react';
import { AnalysisScoreRadar } from '../components/AnalysisScoreRadar';
import { AnalysisFeedbackForm } from '../components/AnalysisFeedbackForm';
import { Navigation } from '../components/Navigation';
import { getAnalysis, getConsultation } from '../utils/storage';
import { normalizeAnalysis } from '../utils/analysisViewModel';

const CONFIDENCE = {
  low: { label: '低い', className: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  medium: { label: '中程度', className: 'bg-orange-50 text-orange-700 border-orange-200' },
  high: { label: '高い', className: 'bg-green-50 text-green-700 border-green-200' },
};

function MissingResult() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-[#F7F9FC] flex items-center justify-center">
      <div className="text-center">
        <p className="text-[#5B6573] mb-4">分析結果が見つからないか、表示できない形式です。</p>
        <button onClick={() => navigate('/')} className="font-medium text-[#0F4C81]">ホームに戻る</button>
      </div>
    </div>
  );
}

export function AnalysisV17() {
  const { id, caseId } = useParams<{ id?: string; caseId?: string }>();
  const navigate = useNavigate();
  const resolvedId = id ?? caseId;
  const consultation = resolvedId ? getConsultation(resolvedId) : undefined;
  const view = resolvedId ? normalizeAnalysis(getAnalysis(resolvedId)) : null;

  if (!consultation || !view) return <MissingResult />;
  const conf = CONFIDENCE[view.confidenceLevel];

  return (
    <div className="min-h-screen bg-[#F7F9FC]">
      <Navigation />
      <div className="lg:ml-64 pb-24 lg:pb-8">
        <div className="sticky top-0 z-10 border-b border-[#D9E1EA] bg-white p-4 lg:px-8">
          <div className="mx-auto flex max-w-5xl items-center gap-3">
            <button onClick={() => navigate('/')} className="text-[#5B6573]" aria-label="ホームへ戻る">
              <ArrowLeft className="h-6 w-6" />
            </button>
            <h1 className="text-xl font-semibold lg:text-2xl">分析結果</h1>
          </div>
        </div>

        <main className="mx-auto max-w-5xl space-y-5 p-4 lg:p-8">
          {view.isLegacy && (
            <div className="flex gap-2 rounded-xl border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              旧形式の分析結果を互換表示しています。再分析時は新しい6指標形式になります。
            </div>
          )}

          <section className="rounded-2xl border border-[#D9E1EA] bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs text-[#5B6573]">{consultation.personName}さんとの状況</p>
                <h2 className="mt-1 text-lg font-semibold text-[#1F2A37]">{view.summary}</h2>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs font-medium ${conf.className}`}>
                分析の確信度：{conf.label}
              </span>
            </div>
            <p className="mt-3 text-xs text-[#5B6573]">確信度も事実認定ではなく、入力情報に基づく出力の安定性の目安です。</p>
          </section>

          <section className="rounded-2xl border border-[#D9E1EA] bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-[#1F2A37]">今回の入力</h2>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-xs text-[#5B6573]">起きた出来事</dt><dd className="mt-1 text-[#1F2A37]">{consultation.event}</dd></div>
              <div><dt className="text-xs text-[#5B6573]">相手の反応</dt><dd className="mt-1 text-[#1F2A37]">{consultation.reaction}</dd></div>
              <div><dt className="text-xs text-[#5B6573]">経過時間</dt><dd className="mt-1 text-[#1F2A37]">{consultation.timing}</dd></div>
              <div><dt className="text-xs text-[#5B6573]">自分の対応</dt><dd className="mt-1 whitespace-pre-wrap text-[#1F2A37]">{consultation.userAction || "何もしていない"}</dd></div>
            </dl>
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-2xl border border-[#D9E1EA] bg-white p-5 shadow-sm">
              <h2 className="mb-1 font-semibold text-[#1F2A37]">感情スコア分析</h2>
              {view.scoreDescription && <p className="mb-2 text-sm text-[#5B6573]">{view.scoreDescription}</p>}
              <AnalysisScoreRadar scores={view.scores} />
              <div className="mt-4 space-y-2">
                {view.scores.map((score) => score.reason && (
                  <div key={score.key} className="rounded-lg bg-[#F7F9FC] p-3 text-sm">
                    <span className="font-medium text-[#1F2A37]">{score.label}：</span>
                    <span className="text-[#5B6573]">{score.reason}</span>
                  </div>
                ))}
              </div>
            </section>

            <div className="space-y-4">
              <section className="rounded-2xl border border-[#D9E1EA] bg-white p-5 shadow-sm">
                <h2 className="font-semibold text-[#1F2A37]">文面の印象</h2>
                <p className="mt-2 text-sm leading-relaxed text-[#5B6573]">{view.textImpression}</p>
              </section>
              <section className="rounded-2xl border border-[#D9E1EA] bg-white p-5 shadow-sm">
                <h2 className="font-semibold text-[#1F2A37]">状況からの読み取り</h2>
                <p className="mt-2 text-sm leading-relaxed text-[#5B6573]">{view.situationReading}</p>
              </section>
              <section className="rounded-2xl border border-[#D9E1EA] bg-[#E8F1F8] p-5">
                <h2 className="font-semibold text-[#0F4C81]">連絡のタイミング</h2>
                <p className="mt-2 text-sm leading-relaxed text-[#0F4C81]">{view.contactTiming}</p>
              </section>
            </div>
          </div>

          <section className="rounded-2xl border border-[#D9E1EA] bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Info className="h-4 w-4 text-[#0F4C81]" />
              <h2 className="font-semibold text-[#1F2A37]">根拠と不確実性</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <Evidence title="気になるサイン" items={view.concernSignals} empty="明確なサインはありません" />
              <Evidence title="心配を弱めるサイン" items={view.reassuringSignals} empty="該当情報はありません" />
              <Evidence title="まだ分からないこと" items={view.unknowns} empty="旧形式では記録されていません" />
            </div>
          </section>

          {(view.alternatives.length > 0 || view.balancedView) && (
            <section className="rounded-2xl border border-[#D9E1EA] bg-white p-5 shadow-sm">
              <h2 className="font-semibold text-[#1F2A37]">別の見方</h2>
              <div className="mt-3 space-y-3">
                {view.alternatives.map((item, index) => (
                  <div key={`${item.label}-${index}`} className="rounded-xl bg-[#F7F9FC] p-3">
                    <p className="text-sm font-medium text-[#1F2A37]">{item.label}</p>
                    <p className="mt-1 text-sm text-[#5B6573]">{item.reason}</p>
                  </div>
                ))}
                {view.balancedView && <p className="text-sm leading-relaxed text-[#5B6573]">{view.balancedView}</p>}
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-[#D9E1EA] bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-[#1F2A37]">普段との比較</h2>
            <p className="mt-2 text-sm text-[#5B6573]">{view.contextComparison.conclusion}</p>
            <p className="mt-2 text-xs text-[#8A94A6]">{view.contextComparison.enabled ? "許可された過去情報を実際に参照した比較です。" : "比較に十分な許可済み情報がないため、今回の入力を中心に整理しています。"}</p>
          </section>

          {view.resultId && <AnalysisFeedbackForm resultId={view.resultId} />}

          <section className="rounded-xl border border-[#D9E1EA] bg-white p-4 text-sm text-[#5B6573]">
            <strong className="text-[#1F2A37]">注意：</strong> {view.disclaimer}
          </section>

          <button
            onClick={() => navigate(`/action/${consultation.id}`)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0F4C81] py-4 font-semibold text-white hover:bg-[#0C3E69]"
          >
            具体的な行動・返信例を見る <ArrowRight className="h-5 w-5" />
          </button>
        </main>
      </div>
    </div>
  );
}

function Evidence({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div>
      <h3 className="text-sm font-medium text-[#1F2A37]">{title}</h3>
      {items.length > 0 ? (
        <ul className="mt-2 space-y-2 text-sm text-[#5B6573]">
          {items.map((item, index) => <li key={`${item}-${index}`}>・{item}</li>)}
        </ul>
      ) : <p className="mt-2 text-sm text-[#8A94A6]">{empty}</p>}
    </div>
  );
}
