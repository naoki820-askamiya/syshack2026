import { useParams, useNavigate } from 'react-router';
import { ArrowLeft, ArrowRight, Clock, AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { getConsultation, getAnalysis } from '../utils/storage';
import { getRelationStyle } from '../utils/relationStyles';
import { EmotionRadarChart } from '../components/EmotionRadarChart';
import { Navigation } from '../components/Navigation';

const CONFIDENCE_MAP = {
  low:    { label: '低い',   color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  medium: { label: '中程度', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  high:   { label: '高い',   color: 'bg-green-100 text-green-700 border-green-200'  },
};

export function Analysis() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const consultation = id ? getConsultation(id) : undefined;
  const analysis = id ? getAnalysis(id) : undefined;

  if (!consultation || !analysis) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-pink-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">相談データが見つかりません</p>
          <button onClick={() => navigate('/')} className="text-purple-600 hover:text-purple-700 font-medium">
            ホームに戻る
          </button>
        </div>
      </div>
    );
  }

  const relStyle = getRelationStyle(consultation.relation);
  const conf = CONFIDENCE_MAP[analysis.result.confidenceLevel];

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 to-purple-50">
      <Navigation />

      <div className="lg:ml-64 pb-24 lg:pb-8">
        {/* ヘッダー */}
        <div className="bg-white border-b border-gray-200 p-4 lg:px-8 sticky top-0 z-10">
          <div className="max-w-5xl mx-auto flex items-center gap-3">
            <button onClick={() => navigate('/')} className="text-gray-600 hover:text-gray-800">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <h1 className="text-xl lg:text-2xl font-semibold">分析結果</h1>
          </div>
        </div>

        <div className="max-w-5xl mx-auto p-4 lg:p-8 space-y-5">

          {/* ── 相談概要 ── */}
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <div className="flex items-start justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{relStyle.emoji}</span>
                <div>
                  <h2 className="font-semibold text-gray-800 text-lg">{consultation.personName}さん</h2>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${relStyle.badge}`}>{consultation.relation}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Clock className="w-3.5 h-3.5" />
                {new Date(consultation.createdAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              <div className="bg-gray-50 rounded-lg p-3">
                <span className="text-xs text-gray-500 block mb-1">出来事</span>
                <p className="text-gray-800 leading-relaxed">{consultation.event}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <span className="text-xs text-gray-500 block mb-1">相手の反応・経過時間</span>
                <p className="text-gray-800">{consultation.reaction} ／ {consultation.timing}</p>
              </div>
            </div>
          </div>

          {/* ── メインコンテンツ: 2カラム ── */}
          <div className="lg:grid lg:grid-cols-2 lg:gap-5 space-y-5 lg:space-y-0">

            {/* 左: レーダーチャート */}
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-800">感情スコア分析</h3>
                <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${conf.color}`}>
                  確信度：{conf.label}
                </span>
              </div>
              <EmotionRadarChart scores={analysis.result.scores} />
            </div>

            {/* 右: 印象 + 連絡タイミング */}
            <div className="space-y-4">
              {/* 文面の印象 */}
              <div className="bg-white rounded-2xl p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-sm">💬</span>
                  </div>
                  <h3 className="font-semibold text-gray-800 text-sm">文面の印象</h3>
                </div>
                <p className="text-gray-700 text-sm leading-relaxed">{analysis.result.textImpression}</p>
              </div>

              {/* 状況の印象 */}
              <div className="bg-white rounded-2xl p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-sm">🔍</span>
                  </div>
                  <h3 className="font-semibold text-gray-800 text-sm">状況からの読み取り</h3>
                </div>
                <p className="text-gray-700 text-sm leading-relaxed">{analysis.result.contextImpression}</p>
              </div>

              {/* 連絡タイミング */}
              <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-2xl p-5 border border-purple-100">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-4 h-4 text-purple-600 flex-shrink-0" />
                  <h3 className="font-semibold text-purple-800 text-sm">連絡のタイミング</h3>
                </div>
                <p className="text-purple-700 text-sm leading-relaxed">{analysis.result.contactTiming}</p>
              </div>
            </div>
          </div>

          {/* ── 分析理由 ── */}
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Info className="w-4 h-4 text-gray-500" />
              <h3 className="font-semibold text-gray-800">この分析の根拠</h3>
            </div>
            <div className="space-y-3">
              {analysis.result.reasons.map((reason, i) => (
                <div key={i} className="flex gap-3">
                  <div className="flex-shrink-0">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                      {reason.label}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed pt-0.5">{reason.detail}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── 次へボタン ── */}
          <button
            onClick={() => navigate(`/action/${consultation.id}`)}
            className="w-full bg-gradient-to-r from-pink-500 to-purple-500 text-white py-4 lg:py-5 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-shadow flex items-center justify-center gap-2 lg:text-lg"
          >
            具体的な行動・返信例を見る
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
