import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import {
  ArrowLeft, Copy, CheckCircle2, XCircle, Lightbulb,
  ThumbsUp, AlertTriangle, MessageSquare,
} from 'lucide-react';
import { getConsultation, getAnalysis } from '../utils/storage';
import { getRelationStyle } from '../utils/relationStyles';
import { Navigation } from '../components/Navigation';

const TONE_BADGE: Record<string, { label: string; color: string }> = {
  formal:  { label: 'ビジネス',    color: 'bg-blue-100 text-blue-700' },
  neutral: { label: 'ふつう',      color: 'bg-gray-100 text-gray-600' },
  casual:  { label: 'カジュアル',  color: 'bg-pink-100 text-pink-700' },
};

export function ActionSuggestion() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const consultation = id ? getConsultation(id) : undefined;
  const analysis = id ? getAnalysis(id) : undefined;

  if (!consultation || !analysis) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-pink-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">提案データが見つかりません</p>
          <button onClick={() => navigate('/')} className="text-purple-600 hover:text-purple-700 font-medium">
            ホームに戻る
          </button>
        </div>
      </div>
    );
  }

  const relStyle = getRelationStyle(consultation.relation);

  const handleCopy = (text: string, index: number) => {
    // Clipboard API が使えない環境（iframe内など）ではフォールバック
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const fallbackCopy = (text: string) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try { document.execCommand('copy'); } catch (_) { /* silent */ }
    document.body.removeChild(ta);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 to-purple-50">
      <Navigation />

      <div className="lg:ml-64 pb-24 lg:pb-8">
        {/* ヘッダー */}
        <div className="bg-white border-b border-gray-200 p-4 lg:px-8 sticky top-0 z-10">
          <div className="max-w-5xl mx-auto flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="text-gray-600 hover:text-gray-800">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <h1 className="text-xl lg:text-2xl font-semibold">行動提案</h1>
          </div>
        </div>

        <div className="max-w-5xl mx-auto p-4 lg:p-8 space-y-5">

          {/* 相手情報 */}
          <div className="bg-white rounded-2xl p-4 lg:p-5 shadow-sm flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{relStyle.emoji}</span>
              <div>
                <h2 className="font-semibold text-gray-800 lg:text-lg">{consultation.personName}さん</h2>
                <span className={`text-xs px-2 py-0.5 rounded-full ${relStyle.badge}`}>{consultation.relation}</span>
              </div>
            </div>
          </div>

          {/* ── 上段: 推奨アクション + 良いサイン ── */}
          <div className="lg:grid lg:grid-cols-2 lg:gap-5 space-y-5 lg:space-y-0">

            {/* 推奨アクション */}
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                </div>
                <h3 className="font-semibold text-gray-800">推奨アクション</h3>
              </div>
              <div className="space-y-3">
                {analysis.result.actions.map((action, i) => (
                  <div key={i} className="flex items-start gap-3 bg-green-50 rounded-xl p-3.5 border border-green-100">
                    <div className="flex-shrink-0 w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-xs font-semibold">
                      {i + 1}
                    </div>
                    <p className="text-gray-800 text-sm flex-1 leading-relaxed">{action.text}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* 良いサイン */}
            <div className="bg-white rounded-2xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-teal-100 rounded-full flex items-center justify-center">
                  <ThumbsUp className="w-4 h-4 text-teal-600" />
                </div>
                <h3 className="font-semibold text-gray-800">良いサイン</h3>
              </div>
              <div className="space-y-2.5">
                {analysis.result.goodSignals.map((signal, i) => (
                  <div key={i} className="flex items-start gap-2.5 bg-teal-50 rounded-xl p-3.5 border border-teal-100">
                    <span className="text-teal-500 flex-shrink-0 mt-0.5">✓</span>
                    <p className="text-gray-800 text-sm leading-relaxed">{signal.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── 避けるべき表現 ── */}
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 text-red-600" />
              </div>
              <h3 className="font-semibold text-gray-800">避けるべき表現・行動</h3>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {analysis.result.avoidExpressions.map((expr, i) => (
                <div key={i} className="flex items-start gap-2.5 bg-red-50 rounded-xl p-3.5 border border-red-100">
                  <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-gray-800 text-sm leading-relaxed">{expr.text}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── 返信例 ── */}
          <div className="bg-white rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center">
                <MessageSquare className="w-4 h-4 text-yellow-600" />
              </div>
              <h3 className="font-semibold text-gray-800">返信例</h3>
            </div>
            <p className="text-xs text-gray-500 mb-4 ml-10">
              そのままコピーして使えます。あなたの言葉でアレンジしてもOK！
            </p>
            <div className="space-y-3">
              {analysis.result.replyExamples.map((example, i) => {
                const tone = TONE_BADGE[example.tone] ?? TONE_BADGE.neutral;
                return (
                  <div key={i} className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100">
                    <div className="flex items-center justify-between mb-2.5 flex-wrap gap-2">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${tone.color}`}>
                        {tone.label}
                      </span>
                      <button
                        onClick={() => handleCopy(example.text, i)}
                        className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors"
                      >
                        {copiedIndex === i ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                            <span className="text-green-600">コピー完了！</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            コピー
                          </>
                        )}
                      </button>
                    </div>
                    <p className="text-gray-800 text-sm leading-relaxed">{example.text}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── ボタン ── */}
          <div className="lg:grid lg:grid-cols-2 lg:gap-4 space-y-3 lg:space-y-0">
            <button
              onClick={() => navigate(`/analysis/${consultation.id}`)}
              className="w-full bg-white text-purple-700 py-3 rounded-xl font-medium border-2 border-purple-200 hover:bg-purple-50 transition-colors flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              分析結果に戻る
            </button>
            <button
              onClick={() => navigate(`/new?person=${encodeURIComponent(consultation.personName)}`)}
              className="w-full bg-white text-gray-700 py-4 rounded-xl font-medium border-2 border-gray-200 hover:border-gray-300 transition-colors lg:text-lg"
            >
              新しい相談を始める
            </button>
            <button
              onClick={() => navigate('/')}
              className="w-full bg-gradient-to-r from-pink-500 to-purple-500 text-white py-4 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-shadow lg:text-lg"
            >
              完了
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}