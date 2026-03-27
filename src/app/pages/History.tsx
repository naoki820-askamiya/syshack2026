import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ArrowLeft, MessageCircle, Calendar, User, PlusCircle } from 'lucide-react';
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
    <div className="min-h-screen bg-gradient-to-b from-pink-50 to-purple-50">
      <Navigation />
      
      <div className="lg:ml-64 pb-24 lg:pb-8">
        {/* ヘッダー */}
        <div className="bg-white border-b border-gray-200 p-4 lg:px-8 sticky top-0 z-10">
          <div className="max-w-5xl mx-auto flex items-center gap-3">
            <button onClick={() => navigate('/')} className="lg:hidden text-gray-600 hover:text-gray-800">
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
                <User className="w-4 h-4 text-gray-600" />
                <span className="text-sm font-medium text-gray-700">人物で絞り込み</span>
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
                          ? 'bg-purple-600 text-white'
                          : 'bg-white text-gray-700 border border-gray-200 hover:border-gray-300'
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
            <div className="bg-white rounded-2xl p-8 shadow-sm text-center">
              <Calendar className="w-12 h-12 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-600 mb-4">
                {filterPerson === 'すべて' 
                  ? 'まだ相談履歴がありません'
                  : `${filterPerson}さんの相談履歴がありません`}
              </p>
              <button
                onClick={() => navigate('/new')}
                className="text-purple-600 hover:text-purple-700 font-medium"
              >
                最初の相談を始める
              </button>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm text-gray-600">
                  {sortedConsultations.length}件の相談
                </span>
                {filterPerson !== 'すべて' && (
                  <Link
                    to={`/new?person=${encodeURIComponent(filterPerson)}`}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-xl text-sm font-medium shadow-sm hover:shadow-md transition-shadow"
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
                  return (
                    <Link
                      key={consultation.id}
                      to={`/analysis/${consultation.id}`}
                      className={`block bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow ${relStyle.bgHover}`}
                    >
                      {/* ヘッダー行 */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{relStyle.emoji}</span>
                          <div>
                            <h3 className="font-semibold text-gray-800">
                              {consultation.personName}
                            </h3>
                            <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium mt-0.5 ${relStyle.badge}`}>
                              {consultation.relation}
                            </span>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0 ml-2">
                          <div className="text-xs text-gray-500">
                            {new Date(consultation.createdAt).toLocaleDateString('ja-JP', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </div>
                          <div className="text-xs text-gray-400">
                            {new Date(consultation.createdAt).toLocaleTimeString('ja-JP', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </div>
                      </div>
                      
                      {/* 出来事 */}
                      <div className="mb-3">
                        <span className="text-xs text-gray-500">出来事</span>
                        <p className="text-sm text-gray-800 line-clamp-2 mt-0.5">
                          {consultation.event}
                        </p>
                      </div>

                      {/* 反応・タイミングを個別の行に */}
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400 w-14 flex-shrink-0">反応</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${reactionStyle.text} ${reactionStyle.bg}`}>
                            {consultation.reaction}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400 w-14 flex-shrink-0">タイミング</span>
                          <span className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">
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