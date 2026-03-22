import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, LogIn } from 'lucide-react';

export function Login() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // ログイン処理のモック（実際の認証は未実装）
    console.log('Login attempt:', formData);
    // ログイン成功後はホームに戻る
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 to-purple-50 flex items-center justify-center p-4 lg:p-8">
      <div className="w-full max-w-md lg:max-w-lg">
        {/* 戻るボタン */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-6 lg:mb-8"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>戻る</span>
        </button>

        {/* ログインカード */}
        <div className="bg-white rounded-2xl p-8 lg:p-10 shadow-lg">
          <div className="text-center mb-8">
            <div className="w-16 h-16 lg:w-20 lg:h-20 bg-gradient-to-r from-pink-500 to-purple-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <LogIn className="w-8 h-8 lg:w-10 lg:h-10 text-white" />
            </div>
            <h1 className="text-2xl lg:text-3xl font-bold text-gray-800 mb-2">ログイン</h1>
            <p className="text-gray-600 text-sm lg:text-base">感情ナビへようこそ</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 lg:space-y-5">
            {/* メールアドレス */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                メールアドレス
              </label>
              <input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-3 lg:py-4 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="example@email.com"
                required
              />
            </div>

            {/* パスワード */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                パスワード
              </label>
              <input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-4 py-3 lg:py-4 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="••••••••"
                required
              />
            </div>

            {/* パスワードを忘れた */}
            <div className="text-right">
              <button
                type="button"
                className="text-sm text-purple-600 hover:text-purple-700"
              >
                パスワードを忘れた方
              </button>
            </div>

            {/* ログインボタン */}
            <button
              type="submit"
              className="w-full bg-gradient-to-r from-pink-500 to-purple-500 text-white py-3 lg:py-4 rounded-lg font-semibold shadow-md hover:shadow-lg transition-shadow lg:text-lg"
            >
              ログイン
            </button>
          </form>

          {/* 新規登録 */}
          <div className="mt-6 lg:mt-8 pt-6 border-t border-gray-200 text-center">
            <p className="text-sm text-gray-600 mb-3">
              アカウントをお持ちでない方
            </p>
            <button
              type="button"
              onClick={() => navigate('/register')}
              className="w-full bg-white text-purple-600 py-3 lg:py-4 rounded-lg font-medium border-2 border-purple-600 hover:bg-purple-50 transition-colors lg:text-lg"
            >
              新規登録
            </button>
          </div>
        </div>

        {/* 注意書き */}
        <p className="text-center text-xs text-gray-500 mt-6">
          ※ このアプリはプロトタイプです。実際の認証機能は未実装です。
        </p>
      </div>
    </div>
  );
}