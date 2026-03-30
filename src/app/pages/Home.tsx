import { useMemo } from 'react';
import { Link } from 'react-router';
import { History, Users, PlusCircle, ChevronRight, UserRoundSearch, MessageSquareDashed } from 'lucide-react';
import { getRegisteredPersons, getConsultations } from '../utils/storage';
import { Navigation } from '../components/Navigation';
import { getRelationStyle, getReactionStyle } from '../utils/relationStyles';
import { getRandomSubtitle } from '../utils/randomSubtitle';

export function Home() {
  const persons = getRegisteredPersons();
  const recentConsultations = getConsultations().slice(-5).reverse();

  const randomMessage = useMemo(() => getRandomSubtitle(), []);

  return (
    <div className="min-h-screen bg-[#F7F9FC]">
      <Navigation />
      
      <div className="lg:ml-64 p-4 lg:p-4 pb-24 lg:pb-8">
        <div className="max-w-4xl mx-auto">
          {/* ヘッダー */}
          <div className="text-center py-8 lg:py-8 relative">
            <div className="mx-auto mb-4 h-5 lg:h-5"/> {/* blank */}
            <img src="/kigen404_title_b_transparent.png" alt="KIGEN404" className="mx-auto mb-4 h-28 lg:h-44" />
            <p className="text-[#5B6573] lg:text-lg">{randomMessage}<br/>相手の反応から「本音」をAIが予測、最適な返しまで提案</p>
          </div>

          {/* メインアクション */}
          <Link to="/new" className="block mb-6">
            <button className="w-full bg-[#0F4C81] text-white rounded-2xl p-5 lg:p-7 shadow-sm hover:bg-[#0C3E69] transition-colors hover:scale-[1.01] active:scale-[0.99]">
              <div className="flex items-center justify-center gap-3">
                <PlusCircle className="w-7 h-7 lg:w-9 lg:h-9" />
                <span className="text-xl lg:text-2xl font-semibold">新しい相談を作成</span>
              </div>
              <p className="text-[#E8F1F8] text-sm mt-1">Find their invisible emotion.</p>
            </button>
          </Link>

          <div className="lg:grid lg:grid-cols-3 lg:gap-6 space-y-6 lg:space-y-0">
            {/* 左カラム: 過去の人物 */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-2xl p-5 shadow-sm h-full border border-[#D9E1EA]">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-[#0F4C81]" />
                    <h2 className="text-base font-semibold text-[#1F2A37]">最近の相談対象</h2>
                  </div>
                  {persons.length > 0 && (
                    <span className="text-xs bg-[#E8F1F8] text-[#0F4C81] px-2 py-0.5 rounded-full font-medium">
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
                      const RelationIcon = style.lucideIcon;
                      return (
                        <Link
                          key={person}
                          to={`/history?person=${encodeURIComponent(person)}`}
                          className={`flex items-center justify-between bg-[#F1F4F8] ${style.bgHover} rounded-xl px-4 py-3 transition-colors group`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${style.badge}`}>
                              {RelationIcon ? <RelationIcon className="w-4 h-4" /> : style.emoji}
                            </div>
                            <div>
                              {/* ニックネームを大きめに */}
                              <p className="text-base font-semibold text-[#1F2A37] leading-tight">{person}</p>
                              <div className="flex items-center gap-1.5 mt-1">
                                {/* 関係性バッジ（丸くくる） */}
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${style.badge}`}>
                                  {latest?.relation ?? 'その他'}
                                </span>
                                {latest && (
                                  <span className="text-xs text-[#8A94A6]">{personConsultations.length}件</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-[#B8C2CF] group-hover:text-[#5B6573] transition-colors flex-shrink-0" />
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <UserRoundSearch className="w-15 h-15 text-4xl mb-3" /> {/* Icon */}
                    <p className="text-sm">まだ相談した人物はいません</p>
                    <p className="text-xs text-[#8A94A6] mt-1">相談すると人物が登録されます</p>
                  </div>
                )}
              </div>
            </div>

            {/* 右カラム: 最近の相談履歴 */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#D9E1EA]">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <History className="w-5 h-5 text-[#0F4C81]" />
                    <h2 className="text-base font-semibold text-[#1F2A37]">最近の相談履歴</h2>
                  </div>
                  {recentConsultations.length > 0 && (
                    <Link to="/history" className="flex items-center gap-1 text-sm text-[#0F4C81] hover:text-[#0C3E69] font-medium">
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
                      const RelationIcon = style.lucideIcon;
                      return (
                        <Link
                          key={consultation.id}
                          to={`/action/${consultation.id}`}
                          className={`flex items-start gap-4 bg-[#F1F4F8] ${style.bgHover} rounded-xl p-4 transition-colors group`}
                        >
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm flex-shrink-0 mt-0.5 ${style.badge}`}>
                            {RelationIcon ? <RelationIcon className="w-4 h-4" /> : style.emoji}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-[#1F2A37] text-sm">{consultation.personName}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${style.badge}`}>
                                  {consultation.relation}
                                </span>
                              </div>
                              <span className="text-xs text-[#8A94A6] flex-shrink-0">
                                {new Date(consultation.createdAt).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}
                              </span>
                            </div>
                            <p className="text-sm text-[#5B6573] line-clamp-1">{consultation.event}</p>
                            <div className="flex items-center gap-1.5 mt-1.5">
                              <span className="text-xs text-[#8A94A6]">感情</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${reactionStyle.text} ${reactionStyle.bg}`}>
                                {consultation.reaction}
                              </span>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-[#B8C2CF] group-hover:text-[#5B6573] transition-colors flex-shrink-0 mt-1" />
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <MessageSquareDashed className="w-15 h-15 text-4xl mb-3" /> {/* Icon */}
                    <h3 className="text-base font-semibold text-[#1F2A37] mb-2">
                      人間関係の悩み、相談してみませんか？
                    </h3>
                    <p className="text-[#5B6573] text-sm leading-relaxed max-w-xs">
                      「相手の機嫌が分からない」「どう対応すればいいか分からない」そんな時、具体的な行動を提案します。
                    </p>
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
