import { useParams, useNavigate } from 'react-router';
import { ArrowLeft, ArrowRight, Clock, AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { getConsultation, getAnalysis } from '../utils/storage';
import { getRelationStyle, getReactionStyle } from '../utils/relationStyles';
import { EmotionRadarChart } from '../components/EmotionRadarChart';
import { Navigation } from '../components/Navigation';

const CONFIDENCE_MAP = {
  low:    { label: '低い',   color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  medium: { label: '中程度', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  high:   { label: '高い',   color: 'bg-green-100 text-green-700 border-green-200'  },
};

export function Analysis() {
  const { id, caseId } = useParams<{ id?: string; caseId?: string }>();
  const navigate = useNavigate();
  const resolvedId = id ?? caseId;

  const consultation = resolvedId ? getConsultation(resolvedId) : undefined;
  const analysis = resolvedId ? getAnalysis(resolvedId) : undefined;

  if (!consultation || !analysis) {
    return (
      <div className="min-h-screen bg-[#F7F9FC] flex items-center justify-center">
        <div className="text-center">
          <p className="text-[#5B6573] mb-4">相談データが見つかりません</p>
          <button onClick={() => navigate('/')} className="text-[#0F4C81] hover:text-[#0C3E69] font-medium">
            ホームに戻る
          </button>
        </div>
      </div>
    );
  }

  const relStyle = getRelationStyle(consultation.relation);
  const RelationIcon = relStyle.lucideIcon;
  const reactionStyle = getReactionStyle(consultation.reaction);
  const conf = CONFIDENCE_MAP[analysis.result.confidenceLevel];

  return (
    <div className="min-h-screen bg-[#F7F9FC]">
      <Navigation />

      <div className="lg:ml-64 pb-24 lg:pb-8">
        {/* ヘッダー */}
        <div className="bg-white border-b border-[#D9E1EA] p-4 lg:px-8 sticky top-0 z-10">
          <div className="max-w-5xl mx-auto flex items-center gap-3">
            <button onClick={() => navigate('/')} className="text-[#5B6573] hover:text-[#1F2A37]">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <h1 className="text-xl lg:text-2xl font-semibold">分析結果</h1>
          </div>
        </div>

        <div className="max-w-5xl mx-auto p-4 lg:p-8 space-y-5">

          {/* ── 相談概要 ── */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#D9E1EA]">
            <div className="flex items-start justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center shadow-sm ${relStyle.badge}`}>
                  {RelationIcon ? <RelationIcon className="w-6 h-6" /> : <span className="text-2xl">{relStyle.emoji}</span>}
                </div>
                <div>
                  <h2 className="font-semibold text-[#1F2A37] text-lg">{consultation.personName}さん</h2>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${relStyle.badge}`}>{consultation.relation}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-[#8A94A6]">
                <Clock className="w-3.5 h-3.5" />
                {new Date(consultation.createdAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
            <div className="mt-3 space-y-2 text-sm">
              <div className="bg-[#F1F4F8] rounded-lg p-3">
                <span className="text-xs text-[#5B6573] block mb-1">出来事</span>
                <p className="text-[#1F2A37] leading-relaxed">{consultation.event}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="bg-[#F1F4F8] rounded-lg p-3">
                  <span className="text-xs text-[#5B6573] block mb-1">相手の反応</span>
                  <p className="text-[#1F2A37]">
                    <span className={`inline-block px-3 py-1 text-sm rounded-full ${reactionStyle.text} ${reactionStyle.bg}`}>
                      {consultation.reaction}
                    </span>
                  </p>
                </div>
                <div className="bg-[#F1F4F8] rounded-lg p-3">
                  <span className="text-xs text-[#5B6573] block mb-1">経過時間</span>
                  <p className="text-[#1F2A37]">{consultation.timing}</p>
                </div>
              </div>
            </div>
          </div>

          {/* ── メインコンテンツ: 2カラム ── */}
          <div className="lg:grid lg:grid-cols-2 lg:gap-5 space-y-5 lg:space-y-0">

            {/* 左: レーダーチャート */}
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#D9E1EA]">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-[#1F2A37]">感情スコア分析</h3>
                <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${conf.color}`}>
                  確信度：{conf.label}
                </span>
              </div>
              <EmotionRadarChart scores={analysis.result.scores} />
            </div>

            {/* 右: 印象 + 連絡タイミング */}
            <div className="space-y-4">
              {/* 文面の印象 */}
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#D9E1EA]">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 bg-[#E8F1F8] rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-sm">💬</span>
                  </div>
                  <h3 className="font-semibold text-[#1F2A37] text-sm">文面の印象</h3>
                </div>
                <p className="text-[#5B6573] text-sm leading-relaxed">{analysis.result.textImpression}</p>
              </div>

              {/* 状況の印象 */}
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#D9E1EA]">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 bg-[#F1F4F8] rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-sm">🔍</span>
                  </div>
                  <h3 className="font-semibold text-[#1F2A37] text-sm">状況からの読み取り</h3>
                </div>
                <p className="text-[#5B6573] text-sm leading-relaxed">{analysis.result.contextImpression}</p>
              </div>

              {/* 連絡タイミング */}
              <div className="bg-[#E8F1F8] rounded-2xl p-5 border border-[#D9E1EA]">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-4 h-4 text-[#0F4C81] flex-shrink-0" />
                  <h3 className="font-semibold text-[#0F4C81] text-sm">連絡のタイミング</h3>
                </div>
                <p className="text-[#0F4C81] text-sm leading-relaxed">{analysis.result.contactTiming}</p>
              </div>
            </div>
          </div>

          {/* ── 分析理由 ── */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#D9E1EA]">
            <div className="flex items-center gap-2 mb-4">
              <Info className="w-4 h-4 text-[#8A94A6]" />
              <h3 className="font-semibold text-[#1F2A37]">この分析の根拠</h3>
            </div>
            <div className="space-y-3">
              {analysis.result.reasons.map((reason, i) => (
                <div key={i} className="flex gap-3">
                  <div className="flex-shrink-0">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-[#E8F1F8] text-[#0F4C81]">
                      {reason.label}
                    </span>
                  </div>
                  <p className="text-sm text-[#5B6573] leading-relaxed pt-0.5">{reason.detail}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── 次へボタン ── */}
          <button
            onClick={() => navigate(`/action/${consultation.id}`)}
            className="w-full bg-[#0F4C81] text-white py-4 lg:py-5 rounded-xl font-semibold shadow-sm hover:bg-[#0C3E69] transition-colors flex items-center justify-center gap-2 lg:text-lg"
          >
            具体的な行動・返信例を見る
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
