import { Link, useLocation } from 'react-router';
import { MessageCircle, History, LogIn, User } from 'lucide-react';

export function Navigation() {
  const location = useLocation();
  
  const navItems = [
    { path: '/', icon: MessageCircle, label: 'ホーム' },
    { path: '/history', icon: History, label: '履歴' },
  ];

  return (
    <>
      {/* デスクトップ版: サイドバーナビゲーション */}
      <nav className="hidden lg:flex lg:fixed lg:left-0 lg:top-0 lg:h-screen lg:w-64 lg:flex-col lg:bg-white lg:border-r lg:border-gray-200 lg:z-50">
        {/* ロゴ */}
        <div className="p-6 border-b border-gray-200">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-r from-pink-500 to-purple-500 rounded-xl flex items-center justify-center">
              <MessageCircle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-800">感情ナビ</h1>
              <p className="text-xs text-gray-500">次に送る一言、もう迷わない。</p>
            </div>
          </Link>
        </div>

        {/* メニュー */}
        <div className="flex-1 p-4 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-gradient-to-r from-pink-500 to-purple-500 text-white'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>

        {/* ログインボタン */}
        <div className="p-4 border-t border-gray-200">
          <Link
            to="/login"
            className="flex items-center gap-3 px-4 py-3 rounded-lg text-purple-600 hover:bg-purple-50 transition-colors"
          >
            <LogIn className="w-5 h-5" />
            <span className="font-medium">ログイン</span>
          </Link>
        </div>
      </nav>

      {/* スマホ版: ボトムナビゲーション */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 z-50">
        <div className="max-w-2xl mx-auto flex justify-around">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center gap-1 transition-colors ${
                  isActive ? 'text-purple-600' : 'text-gray-400 hover:text-gray-600'
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
