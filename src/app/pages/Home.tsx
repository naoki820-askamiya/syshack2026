import { Link } from 'react-router';
import { MessageCircle, History, Users, LogIn, PlusCircle, ChevronRight } from 'lucide-react';
import { getRegisteredPersons, getConsultations } from '../utils/storage';
import { Navigation } from '../components/Navigation';
import { getRelationStyle, getReactionStyle } from '../utils/relationStyles';

export function Home() {
  const persons = getRegisteredPersons();
  const recentConsultations = getConsultations().slice(-5).reverse();

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 to-purple-50">
      <Navigation />
      
      <div className="lg:ml-64 p-4 lg:p-8 pb-24 lg:pb-8">
        <div className="max-w-4xl mx-auto">
          {/* ヘッダー */}
          <div className="text-center py-8 lg:py-12 relative">
            <Link 
              to="/login"
              className="lg:hidden absolute top-0 right-0 flex items-center gap-2 px-4 py-2 bg-white text-purple-600 rounded-lg shadow-sm hover:shadow-md transition-shadow font-medium"
            >
              <LogIn className="w-4 h-4" />
              ログイン
            </Link>
            <div className="mx-auto mb-4 h-5 lg:h-5"/> {/* blank */}
            <img src="/public/kigen404_title_b_transparent.png" alt="KIGEN404" className="mx-auto mb-4 h-30 lg:h-30" />
            <p className="text-gray-600 lg:text-lg">見えない感情、見つけましょうか。</p>
          </div>

          {/* メインアクション */}
          <Link to="/new" className="block mb-6">
            <button className="w-full bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-2xl p-5 lg:p-7 shadow-lg hover:shadow-xl transition-all hover:scale-[1.01] active:scale-[0.99]">
              <div className="flex items-center justify-center gap-3">
                <PlusCircle className="w-7 h-7 lg:w-9 lg:h-9" />
                <span className="text-xl lg:text-2xl font-semibold">新しい人物について相談</span>
              </div>
              <p className="text-pink-100 text-sm mt-1">状況を入力して、対応策を見つけよう</p>
            </button>
          </Link>

          <div className="lg:grid lg:grid-cols-3 lg:gap-6 space-y-6 lg:space-y-0">
            {/* 左カラム: 過去の人物 */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-2xl p-5 shadow-sm h-full">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-purple-500" />
                    <h2 className="text-base font-semibold text-gray-800">過去の人物</h2>
                  </div>
                  {persons.length > 0 && (
                    <span className="text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full font-medium">
                      {persons.length}人
                    </span>
                  )}
                </div>

                {persons.length > 0 ? (
                  <div className="space-y-2">
                    {persons.map((person) => {
                      const personConsultations = getConsultations().filter(c => c.personName === person);
                      const latest = personConsultations.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
                      const style = getRelationStyle(latest?.relation ?? 'その他');
                      return (
                        <Link
                          key={person}
                          to={`/history?person=${encodeURIComponent(person)}`}
                          className={`flex items-center justify-between bg-gray-50 ${style.bgHover} rounded-xl px-4 py-3 transition-colors group`}
                        >
                          <div className="flex items-center gap-3">
                            {/* 絵文字アイコン */}
                            <span className="text-2xl">{style.emoji}</span>
                            <div>
                              {/* ニックネームを大きめに */}
                              <p className="text-base font-semibold text-gray-800 leading-tight">{person}</p>
                              <div className="flex items-center gap-1.5 mt-1">
                                {/* 関係性バッジ（丸くくる） */}
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${style.badge}`}>
                                  {latest?.relation ?? 'その他'}
                                </span>
                                {latest && (
                                  <span className="text-xs text-gray-400">{personConsultations.length}件</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors flex-shrink-0" />
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <div className="text-4xl mb-3">👥</div>
                    <p className="text-sm text-gray-500">まだ相談した人物はいません</p>
                    <p className="text-xs text-gray-400 mt-1">相談すると人物が登録されます</p>
                  </div>
                )}
              </div>
            </div>

            {/* 右カラム: 最近の相談履歴 */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <History className="w-5 h-5 text-purple-500" />
                    <h2 className="text-base font-semibold text-gray-800">最近の相談履歴</h2>
                  </div>
                  {recentConsultations.length > 0 && (
                    <Link to="/history" className="flex items-center gap-1 text-sm text-purple-600 hover:text-purple-700 font-medium">
                      すべて見る
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  )}
                </div>

                {recentConsultations.length > 0 ? (
                  <div className="space-y-3">
                    {recentConsultations.map((consultation) => {
                      const style = getRelationStyle(consultation.relation);
                      const reactionStyle = getReactionStyle(consultation.reaction);
                      return (
                        <Link
                          key={consultation.id}
                          to={`/action/${consultation.id}`}
                          className={`flex items-start gap-4 bg-gray-50 ${style.bgHover} rounded-xl p-4 transition-colors group`}
                        >
                          <div className="flex-shrink-0 text-2xl mt-0.5">
                            {style.emoji}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-gray-800 text-sm">{consultation.personName}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${style.badge}`}>
                                  {consultation.relation}
                                </span>
                              </div>
                              <span className="text-xs text-gray-400 flex-shrink-0">
                                {new Date(consultation.createdAt).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}
                              </span>
                            </div>
                            <p className="text-sm text-gray-600 line-clamp-1">{consultation.event}</p>
                            <div className="flex items-center gap-1.5 mt-1.5">
                              <span className="text-xs text-gray-400">感情</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${reactionStyle.text} ${reactionStyle.bg}`}>
                                {consultation.reaction}
                              </span>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors flex-shrink-0 mt-1" />
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <div className="text-5xl mb-4">💭</div>
                    <h3 className="text-base font-semibold text-gray-800 mb-2">
                      人間関係の悩み、相談してみませんか？
                    </h3>
                    <p className="text-gray-500 text-sm leading-relaxed max-w-xs">
                      「相手の機嫌が分からない」「どう対応すればいいか分からない」そんな時、具体的な行動を提案します。
                    </p>
                    <Link
                      to="/new"
                      className="mt-5 inline-flex items-center gap-2 bg-gradient-to-r from-pink-500 to-purple-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-md hover:shadow-lg transition-shadow"
                    >
                      <PlusCircle className="w-4 h-4" />
                      最初の相談を始める
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}