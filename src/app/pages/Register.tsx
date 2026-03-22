import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, UserPlus } from 'lucide-react';

export function Register() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.password !== formData.confirmPassword) {
      alert('パスワードが一致しません');
      return;
    }
    
    // 新規登録処理のモック（実際の認証は未実装）
    console.log('Register attempt:', formData);
    // 登録成功後はホームに戻る
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 to-purple-50 flex items-center justify-center p-4 lg:p-8">
      <div className="w-full max-w-md lg:max-w-lg">
        {/* 戻るボタン */}
        <button
          onClick={() => navigate('/login')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-6 lg:mb-8"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>戻る</span>
        </button>

        {/* 登録カード */}
        <div className="bg-white rounded-2xl p-8 lg:p-10 shadow-lg">
          <div className="text-center mb-8">
            <div className="w-16 h-16 lg:w-20 lg:h-20 bg-gradient-to-r from-pink-500 to-purple-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <UserPlus className="w-8 h-8 lg:w-10 lg:h-10 text-white" />
            </div>
            <h1 className="text-2xl lg:text-3xl font-bold text-gray-800 mb-2">新規登録</h1>
            <p className="text-gray-600 text-sm lg:text-base">感情ナビを始めましょう</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 lg:space-y-5">
            {/* 名前 */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                お名前
              </label>
              <input
                id="name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-3 lg:py-4 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="山田太郎"
                required
              />
            </div>

            {/* メールアドレス */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                メールアド���ス
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
                placeholder="8文字以上"
                required
                minLength={8}
              />
            </div>

            {/* パスワード確認 */}
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
                パスワード（確認）
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                className="w-full px-4 py-3 lg:py-4 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="もう一度入力してください"
                required
              />
            </div>

            {/* 登録ボタン */}
            <button
              type="submit"
              className="w-full bg-gradient-to-r from-pink-500 to-purple-500 text-white py-3 lg:py-4 rounded-lg font-semibold shadow-md hover:shadow-lg transition-shadow mt-6 lg:text-lg"
            >
              登録する
            </button>
          </form>

          {/* ログイン */}
          <div className="mt-6 lg:mt-8 pt-6 border-t border-gray-200 text-center">
            <p className="text-sm text-gray-600">
              すでにアカウントをお持ちの方は
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="text-purple-600 hover:text-purple-700 font-medium ml-1"
              >
                ログイン
              </button>
            </p>
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