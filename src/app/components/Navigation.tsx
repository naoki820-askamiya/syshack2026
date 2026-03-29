import { useState, useEffect, useSyncExternalStore } from 'react';
import { Link, useLocation } from 'react-router';
import { MessageCircle, History, ChevronRight, ChevronDown } from 'lucide-react';
import { getConsultations } from '../utils/storage';
import { getRelationStyle } from '../utils/relationStyles';
import { ConsultationData } from '../types';
import {
  getExpandedPerson,
  setExpandedPerson,
  subscribeExpandedPerson,
} from '../utils/navigationState';

/** personName ごとに最新の相談を1件返す */
function getRecentPersons(consultations: ConsultationData[]) {
  const map = new Map<string, ConsultationData>();
  [...consultations]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .forEach((c) => map.set(c.personName, c));
  return Array.from(map.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function Navigation() {
  const location = useLocation();
  const [persons, setPersons] = useState<ConsultationData[]>([]);

  // シングルトンストアから展開状態を読む（ページ遷移後も保持）
  const expandedPerson = useSyncExternalStore(
    subscribeExpandedPerson,
    getExpandedPerson
  );

  useEffect(() => {
    setPersons(getRecentPersons(getConsultations()));
  }, [location.pathname]);

  // ※ パス変更時のリセットは行わない（展開状態を保持するため）

  const navItems = [
    { path: '/', icon: MessageCircle, label: '新しい人物について質問' },
    { path: '/history', icon: History, label: '履歴' },
  ];

  return (
    <>
      {/* デスクトップ版: サイドバーナビゲーション */}
      <nav className="hidden lg:flex lg:fixed lg:left-0 lg:top-0 lg:h-screen lg:w-64 lg:flex-col lg:bg-white lg:border-r lg:border-[#D9E1EA] lg:z-50">
        {/* ロゴ */}
        <div className="flex items-center justify-center h-24 border-b border-[#D9E1EA]">
          <Link to="/">
            <img src="/kigen404_title_b_transparent.png" alt="KIGEN404" className="h-20" />
          </Link>
        </div>

        {/* メニュー + 人物リスト */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-[#0F4C81] text-white'
                    : 'text-[#5B6573] hover:bg-[#F1F4F8]'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}

          {/* ── 相談した人物リスト ── */}
          {persons.length > 0 && (
            <div className="pt-2">
              <p className="px-4 py-1.5 text-[11px] font-semibold text-[#8A94A6] uppercase tracking-wider">
                最近の相談相手
              </p>
              <div className="space-y-0.5">
                {persons.map((person) => {
                  const style = getRelationStyle(person.relation);
                  const isExpanded = expandedPerson === person.personName;
                  return (
                    <div key={person.id}>
                      {/* 人物行（クリックで展開） */}
                      <button
                        onClick={() =>
                          setExpandedPerson(isExpanded ? null : person.personName)
                        }
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors group text-[#5B6573] hover:bg-[#F1F4F8]"
                      >
                        {/* アバター */}
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${style.badge}`}>
                          {style.emoji}
                        </div>
                        {/* 名前 + 関係性 */}
                        <div className="flex-1 min-w-0 text-left">
                          <p className="text-sm font-medium leading-tight truncate">
                            {person.personName}
                          </p>
                          <p className={`text-[10px] leading-tight truncate px-1.5 py-0.5 rounded-full inline-block ${style.badge}`}>
                            {person.relation}
                          </p>
                        </div>
                        {isExpanded
                          ? <ChevronDown className="w-3.5 h-3.5 text-[#8A94A6] flex-shrink-0 transition-transform" />
                          : <ChevronRight className="w-3.5 h-3.5 text-[#B8C2CF] group-hover:text-[#5B6573] flex-shrink-0 transition-colors" />
                        }
                      </button>

                      {/* 展開メニュー */}
                      {isExpanded && (
                        <div className="ml-10 mt-0.5 mb-1 space-y-0.5">
                          <Link
                            to={`/new?person=${encodeURIComponent(person.personName)}`}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-[#0F4C81] hover:bg-[#E8F1F8] transition-colors font-medium"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            その人について相談
                          </Link>
                          <Link
                            to={`/history?person=${encodeURIComponent(person.personName)}`}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-[#0F4C81] hover:bg-[#E8F1F8] transition-colors font-medium"
                          >
                            <History className="w-3.5 h-3.5" />
                            履歴
                          </Link>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* スマホ版: ボトムナビゲーション */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-[#D9E1EA] p-4 z-50">
        <div className="max-w-2xl mx-auto flex justify-around">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center gap-1 transition-colors ${
                  isActive ? 'text-[#0F4C81]' : 'text-[#8A94A6] hover:text-[#5B6573]'
                }`}
              >
                <Icon className="w-6 h-6" />
                <span className="text-xs font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
