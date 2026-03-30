import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ArrowLeft, Calendar, User, PlusCircle } from 'lucide-react';
import { getConsultations, getRegisteredPersons } from '../utils/storage';
import { Navigation } from '../components/Navigation';
import { getRelationStyle, getReactionStyle } from '../utils/relationStyles';

export function History() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialPerson = searchParams.get('person') ?? 'すべて';
  const [filterPerson, setFilterPerson] = useState<string>(initialPerson);

  // URLパラメータが変わったときにフィルターを更新
  useEffect(() => {
    const p = searchParams.get('person') ?? 'すべて';
    setFilterPerson(p);
  }, [searchParams]);

  const allConsultations = getConsultations();
  const persons = ['すべて', ...getRegisteredPersons()];
  
  const filteredConsultations = filterPerson === 'すべて'
    ? allConsultations
    : allConsultations.filter(c => c.personName === filterPerson);

  const sortedConsultations = [...filteredConsultations].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <div className="min-h-screen bg-[#F7F9FC]">
      <Navigation />
      
      <div className="lg:ml-64 pb-24 lg:pb-8">
        {/* ヘッダー */}
        <div className="bg-white border-b border-[#D9E1EA] p-4 lg:px-8 sticky top-0 z-10">
          <div className="max-w-5xl mx-auto flex items-center gap-3">
            <button onClick={() => navigate('/')} className="lg:hidden text-[#5B6573] hover:text-[#1F2A37]">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <h1 className="text-xl lg:text-2xl font-semibold">相談履歴</h1>
          </div>
        </div>

        <div className="max-w-5xl mx-auto p-4 lg:p-8">
          {/* 人物フィルター */}
          {persons.length > 1 && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <User className="w-4 h-4 text-[#5B6573]" />
                <span className="text-sm font-medium text-[#5B6573]">人物で絞り込み</span>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {persons.map((person) => {
                  const isActive = filterPerson === person;
                  return (
                    <button
                      key={person}
                      onClick={() => setFilterPerson(person)}
                      className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                        isActive
                          ? 'bg-[#0F4C81] text-white'
                          : 'bg-white text-[#5B6573] border border-[#D9E1EA] hover:border-[#0F4C81]'
                      }`}
                    >
                      {person}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 相談リスト */}
          {sortedConsultations.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 shadow-sm text-center border border-[#D9E1EA]">
              <Calendar className="w-12 h-12 mx-auto text-[#B8C2CF] mb-3" />
              <p className="text-[#5B6573] mb-4">
                {filterPerson === 'すべて' 
                  ? 'まだ相談履歴がありません'
                  : `${filterPerson}さんの相談履歴がありません`}
              </p>
              <button
                onClick={() => navigate('/new')}
                className="text-[#0F4C81] hover:text-[#0C3E69] font-medium"
              >
                最初の相談を始める
              </button>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-[#5B6573]">
                  {sortedConsultations.length}件の相談
                </span>
                {filterPerson !== 'すべて' && (
                  <Link
                    to={`/new?person=${encodeURIComponent(filterPerson)}`}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0F4C81] text-white rounded-xl text-sm font-medium shadow-sm hover:bg-[#0C3E69] transition-colors"
                  >
                    <PlusCircle className="w-4 h-4" />
                    その人について相談
                  </Link>
                )}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">
                {sortedConsultations.map((consultation) => {
                  const relStyle = getRelationStyle(consultation.relation);
                  const reactionStyle = getReactionStyle(consultation.reaction);
                  const RelationIcon = relStyle.lucideIcon;
                  return (
                    <Link
                      key={consultation.id}
                      to={`/analysis/${consultation.id}`}
                      className={`block bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow border border-[#D9E1EA] ${relStyle.bgHover}`}
                    >
                      {/* ヘッダー行 */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${relStyle.badge}`}>
                            {RelationIcon ? <RelationIcon className="w-4 h-4" /> : relStyle.emoji}
                          </div>
                          <div>
                            <h3 className="font-semibold text-[#1F2A37]">
                              {consultation.personName}
                            </h3>
                            <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium mt-0.5 ${relStyle.badge}`}>
                              {consultation.relation}
                            </span>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0 ml-2">
                          <div className="text-xs text-[#5B6573]">
                            {new Date(consultation.createdAt).toLocaleDateString('ja-JP', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </div>
                          <div className="text-xs text-[#8A94A6]">
                            {new Date(consultation.createdAt).toLocaleTimeString('ja-JP', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </div>
                      </div>
                      
                      {/* 出来事 */}
                      <div className="mb-3">
                        <span className="text-xs text-[#5B6573]">出来事</span>
                        <p className="text-sm text-[#1F2A37] line-clamp-2 mt-0.5">
                          {consultation.event}
                        </p>
                      </div>

                      {/* 反応・タイミングを個別の行に */}
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[#8A94A6] w-14 flex-shrink-0">反応</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${reactionStyle.text} ${reactionStyle.bg}`}>
                            {consultation.reaction}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[#8A94A6] w-14 flex-shrink-0">タイミング</span>
                          <span className="text-xs text-[#5B6573] bg-[#F1F4F8] px-2 py-0.5 rounded-full">
                            {consultation.timing}
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
