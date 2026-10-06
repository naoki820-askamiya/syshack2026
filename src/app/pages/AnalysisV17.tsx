import type { AnalysisEvidenceView, EvidenceSource, EvidenceStrength } from '../utils/analysisViewModel';
import { useNavigate, useParams } from 'react-router';
import { AlertCircle, ArrowLeft, ArrowRight, Clock, Info, MessageSquare, Search, User } from 'lucide-react';
import { ReadingDisclosure } from '../components/ReadingDisclosure';
import { AnalysisScoreRadar } from '../components/AnalysisScoreRadar';
import { AnalysisFeedbackForm } from '../components/AnalysisFeedbackForm';
import { Navigation } from '../components/Navigation';
import { useHydratedAnalysis } from '../hooks/useHydratedAnalysis';

const CONFIDENCE = {
  unknown: { label: '記録なし', className: 'bg-slate-50 text-slate-700 border-slate-200' },
  low: { label: '低い', className: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  medium: { label: '中程度', className: 'bg-orange-50 text-orange-700 border-orange-200' },
  high: { label: '高い', className: 'bg-green-50 text-green-700 border-green-200' },
};

function MissingResult({ message }: { message?: string }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-[#F7F9FC] flex items-center justify-center">
      <div className="text-center">
        <p className="text-[#5B6573] mb-4">{message ?? '分析結果が見つからないか、表示できない形式です。'}</p>
        <button onClick={() => navigate('/')} className="font-medium text-[#0F4C81]">ホームに戻る</button>
      </div>
    </div>
  );
}

export function AnalysisV17() {
  const { id, caseId } = useParams<{ id?: string; caseId?: string }>();
  const navigate = useNavigate();
  const resolvedId = id ?? caseId;
  const { consultation, view, loading, error, status, retry } = useHydratedAnalysis(resolvedId);

  if (!view) return (
    <div className="min-h-screen bg-[#F7F9FC]">
      <Navigation />
      <main className="lg:ml-64 mx-auto max-w-3xl space-y-4 p-6 pb-24">
        <h1 className="text-xl font-semibold">保存した相談の分析</h1>
        <p role="status" aria-live="polite">{loading ? '相談の状態を確認し、状況を整理しています。結果は検証後に表示します。' : status === 'analyzing' ? '分析処理が続いています。画面を閉じても保存した相談から状態を確認できます。' : '相談の状態を確認して、同じ相談から分析を開始・再試行できます。'}</p>
        {consultation && <p className="text-sm">相談を保存しました。</p>}
        {error && <p role="alert" className="text-red-700">{error}</p>}
        <button type="button" disabled={loading} onClick={retry} className="rounded-xl bg-[#0F4C81] px-4 py-3 text-white disabled:opacity-50">{status === 'analyzing' ? '分析状態を再取得' : '同じ相談で分析・再試行'}</button>
        <button type="button" onClick={() => navigate('/history')} className="block text-[#0F4C81]">相談履歴へ戻る</button>
      </main>
    </div>
  );
  if (!consultation) return <MissingResult message={error || undefined} />;
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

        <main className="analysis-reading mx-auto max-w-5xl space-y-6 p-4 lg:p-8">
          {view.isLegacy && (
            <div className="flex gap-2 rounded-xl border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              旧形式の分析結果を互換表示しています。再分析時は新しい6指標形式になります。
            </div>
          )}

          <section className="rounded-2xl border border-[#D9E1EA] bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="mb-3 flex items-center gap-2 font-medium text-[#0F4C81]"><User className="h-5 w-5" />{consultation.personName}<span className="rounded-full bg-[#E8F1F8] px-3 py-1 text-sm">{consultation.relation}</span></p>
                <h2 className="mt-1 text-xl font-semibold leading-relaxed text-[#1F2A37]">{view.summary}</h2>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs font-medium ${conf.className}`}>
                分析の確信度：{conf.label}
              </span>
            </div>
            <p className="mt-3 text-xs text-[#5B6573]">{view.confidenceLevel === 'unknown' ? 'この結果には確信度の記録がありません。' : '確信度はAI自身の評価です。正解率や出力の安定性を実測した値ではなく、相手の感情を事実として認定するものでもありません。'}</p>
            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-[#D9E1EA] pt-4">
              <button type="button" onClick={() => navigate(`/action/${consultation.id}`)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#0F4C81] px-5 py-3 font-semibold text-white hover:bg-[#0C3E69]">
                具体的な行動・返信例を見る <ArrowRight className="h-5 w-5" />
              </button>
              <a href="#analysis-evidence" className="rounded-lg px-3 py-3 font-medium text-[#0F4C81] underline underline-offset-4">根拠を確認</a>
              {view.resultId && <a href="#analysis-feedback" className="rounded-lg px-3 py-3 font-medium text-[#0F4C81] underline underline-offset-4">振り返りを書く</a>}
            </div>
          </section>

          <ReadingDisclosure title="今回の入力を確認">
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-xs text-[#5B6573]">起きた出来事</dt><dd className="mt-1 text-[#1F2A37]">{consultation.event}</dd></div>
              <div><dt className="text-xs text-[#5B6573]">相手の反応</dt><dd className="mt-1 text-[#1F2A37]">{consultation.reaction}</dd></div>
              <div><dt className="text-xs text-[#5B6573]">経過時間</dt><dd className="mt-1 text-[#1F2A37]">{consultation.timing}</dd></div>
              <div><dt className="text-xs text-[#5B6573]">自分の対応</dt><dd className="mt-1 whitespace-pre-wrap text-[#1F2A37]">{consultation.userAction || "何もしていない"}</dd></div>
            </dl>
          </ReadingDisclosure>

          <div className="grid items-start gap-5 lg:grid-cols-2">
            <section className="rounded-2xl border border-[#D9E1EA] bg-white p-5 shadow-sm">
              <h2 className="mb-1 font-semibold text-[#1F2A37]">感情スコア分析</h2>
              {view.scoreDescription && <p className="mb-2 text-sm text-[#5B6573]">{view.scoreDescription}</p>}
              <AnalysisScoreRadar scores={view.scores} />
              <ReadingDisclosure title="各スコアの根拠を読む" compact>
              <div className="space-y-3">
                {view.scores.map((score) => score.reason && (
                  <div key={score.key} className="rounded-lg bg-[#F7F9FC] p-3 text-sm">
                    <span className="font-medium text-[#1F2A37]">{score.label}（{score.category === 'context' ? '状況の材料' : score.category === 'reassurance' ? '心配を弱める材料' : score.category === 'concern' ? '気になる材料' : '分類情報なし'}）：</span>
                    <span className="text-[#5B6573]">{score.reason}</span>
                  </div>
                ))}
              </div>
              </ReadingDisclosure>
            </section>

            <div className="space-y-4">
              <section className="rounded-2xl border border-[#D9E1EA] bg-white p-5 shadow-sm">
                <h2 className="flex items-center gap-3 font-semibold text-[#1F2A37]"><MessageSquare className="h-6 w-6 shrink-0 text-[#0F4C81]" />文面の印象</h2>
                <p className="mt-2 text-sm leading-relaxed text-[#5B6573]">{view.textImpression}</p>
              </section>
              <section className="rounded-2xl border border-[#D9E1EA] bg-white p-5 shadow-sm">
                <h2 className="flex items-center gap-3 font-semibold text-[#1F2A37]"><Search className="h-6 w-6 shrink-0 text-[#0F4C81]" />状況からの読み取り</h2>
                <p className="mt-2 text-sm leading-relaxed text-[#5B6573]">{view.situationReading}</p>
              </section>
              <section className="rounded-2xl border border-[#D9E1EA] bg-[#E8F1F8] p-5">
                <h2 className="flex items-center gap-3 font-semibold text-[#0F4C81]"><Clock className="h-6 w-6 shrink-0" />連絡のタイミング</h2>
                <p className="mt-2 text-sm leading-relaxed text-[#0F4C81]">{view.contactTiming}</p>
              </section>
            </div>
          </div>

          <section id="analysis-evidence" className="scroll-mt-24 rounded-2xl border border-[#D9E1EA] bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Info className="h-4 w-4 text-[#0F4C81]" />
              <h2 className="font-semibold text-[#1F2A37]">根拠と不確実性</h2>
            </div>
            <div className="space-y-4">
              <Evidence title="気になるサイン" tone="concern" items={view.concernSignals} empty="明確なサインはありません" />
              <Evidence title="心配を弱めるサイン" tone="reassurance" items={view.reassuringSignals} empty="該当情報はありません" />
              <Evidence title="まだ分からないこと" tone="unknown" items={view.unknowns} empty="旧形式では記録されていません" />
            </div>
          </section>

          {(view.alternatives.length > 0 || view.balancedView) && (
            <section className="rounded-2xl border border-[#D9E1EA] bg-white p-5 shadow-sm">
              <h2 className="font-semibold text-[#1F2A37]">別の見方</h2>
              {view.balancedView && <p className="mt-3 text-sm leading-relaxed text-[#5B6573]">{view.balancedView}</p>}
              {view.alternatives.length > 0 && <ReadingDisclosure title="ほかの解釈と理由を読む" compact>
              <div className="space-y-3">
                {view.alternatives.map((item, index) => (
                  <div key={`${item.label}-${index}`} className="rounded-xl bg-[#F7F9FC] p-3">
                    <p className="text-sm font-medium text-[#1F2A37]">{item.label}</p>
                    <p className="mt-1 text-sm text-[#5B6573]">{item.reason}</p>
                  </div>
                ))}
              </div>
              </ReadingDisclosure>}
            </section>
          )}

          <section className="rounded-2xl border border-[#D9E1EA] bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-[#1F2A37]">普段との比較</h2>
            <p className="mt-2 text-sm text-[#5B6573]">{view.contextComparison.conclusion}</p>
            <p className="mt-2 text-xs text-[#8A94A6]">{view.contextComparison.enabled ? "許可された過去情報を実際に参照した比較です。" : "比較に十分な許可済み情報がないため、今回の入力を中心に整理しています。"}</p>
            {view.contextComparison.enabled && (
              <ReadingDisclosure title="比較に使った情報と違いを読む" compact>
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <h3 className="text-sm font-medium">比較に使った過去情報</h3>
                  <ul className="mt-2 space-y-3 text-sm text-[#5B6573]">
                    {view.contextComparison.patterns.map((item, index) => <li key={index}>
                      <p>{item.label}</p>
                      <p className="mt-1 text-xs">出典：{sourceLabel(item.source)}</p>
                      <p className="text-xs">今回との関連度（AI評価）：{strengthLabel(item.relevance)}</p>
                    </li>)}
                  </ul>
                  {view.contextComparison.patterns.length === 0 && <p className="mt-2 text-sm text-[#5B6573]">詳細は記録されていません。</p>}
                </div>
                <div>
                  <h3 className="text-sm font-medium">普段と同じように見える点</h3>
                  <ul className="mt-2 space-y-3 text-sm text-[#5B6573]">
                    {view.contextComparison.sameAsUsual.map((item, index) => <li key={index}><p>{item.label}</p><p className="mt-1">理由：{item.reason || '理由は記録されていません。'}</p></li>)}
                  </ul>
                  {view.contextComparison.sameAsUsual.length === 0 && <p className="mt-2 text-sm text-[#5B6573]">明確な共通点は記録されていません。</p>}
                </div>
                <div>
                  <h3 className="text-sm font-medium">今回だけ違って見える点</h3>
                  <ul className="mt-2 space-y-3 text-sm text-[#5B6573]">
                    {view.contextComparison.deviations.map((item, index) => <li key={index}>
                      <p>{item.label}</p><p className="mt-1">理由：{item.reason || '理由は記録されていません。'}</p>
                      <p className="text-xs">根拠の強さ（AI評価）：{strengthLabel(item.strength)}</p>
                    </li>)}
                  </ul>
                  {view.contextComparison.deviations.length === 0 && <p className="mt-2 text-sm text-[#5B6573]">明確な違いは記録されていません。</p>}
                </div>
              </div>
              </ReadingDisclosure>
            )}
          </section>

          {view.resultId && <div id="analysis-feedback" className="scroll-mt-24"><AnalysisFeedbackForm resultId={view.resultId} /></div>}

          <section className="rounded-xl border border-[#D9E1EA] bg-white p-4 text-sm text-[#5B6573]">
            <strong className="text-[#1F2A37]">注意：</strong> {view.disclaimer}
          </section>

          <button
            onClick={() => navigate(`/action/${consultation.id}`)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0F4C81] py-4 font-semibold text-white hover:bg-[#0C3E69]"
          >
            行動・返信例へ進む <ArrowRight className="h-5 w-5" />
          </button>
        </main>
      </div>
    </div>
  );
}

function Evidence({ title, tone, items, empty }: { title: string; tone: 'concern' | 'reassurance' | 'unknown'; items: (string | AnalysisEvidenceView)[]; empty: string }) {
  const accent = tone === 'concern' ? 'border-amber-500' : tone === 'reassurance' ? 'border-green-600' : 'border-slate-400';
  return (
    <div className="rounded-xl border border-[#D9E1EA] bg-[#F7F9FC] p-4">
      <h3 className={`border-l-4 pl-3 text-base font-semibold text-[#1F2A37] ${accent}`}>{title}</h3>
      {items.length > 0 ? (
        <ul className="mt-2 space-y-2 text-sm text-[#5B6573]">
          {items.map((item, index) => <li key={index} className="border-t border-[#D9E1EA] pt-3 first:border-0 first:pt-0">
            {typeof item === 'string' ? item : <>
              <p>{item.text}</p>
              <p className="mt-1 text-xs">出典：{sourceLabel(item.source)}</p>
              <p className="text-xs">根拠の強さ（AI評価）：{strengthLabel(item.strength)}</p>
            </>}
          </li>)}
        </ul>
      ) : <p className="mt-2 text-sm text-[#8A94A6]">{empty}</p>}
    </div>
  );
}

function sourceLabel(source: EvidenceSource): string {
  const labels: Record<EvidenceSource, string> = {
    current_case: '今回の入力（ユーザー記入）',
    recent_case: '過去のAI要約（推測を含む）',
    feedback: 'ユーザーの振り返り（本人の報告）',
    person_profile: '保存された人物要約（推測を含む）',
    unknown: '出典情報なし',
  };
  return labels[source];
}

function strengthLabel(strength: EvidenceStrength): string {
  return strength === 'high' ? '高い' : strength === 'medium' ? '中程度' : strength === 'low' ? '低い' : '評価情報なし';
}
