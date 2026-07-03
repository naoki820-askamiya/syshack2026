import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ArrowLeft, LogIn } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

export function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signIn } = useAuth();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const returnTo = searchParams.get('returnTo') || '/';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setIsSubmitting(true);

    try {
      await signIn(formData.email.trim(), formData.password);
      navigate(returnTo, { replace: true });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'ログインに失敗しました。');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F9FC] flex items-center justify-center p-4 lg:p-8">
      <div className="w-full max-w-md lg:max-w-lg">
        {/* 戻るボタン */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-[#5B6573] hover:text-[#1F2A37] mb-6 lg:mb-8"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>戻る</span>
        </button>

        {/* ログインカード */}
        <div className="bg-white rounded-2xl p-8 lg:p-10 shadow-sm border border-[#D9E1EA]">
          <div className="text-center mb-8">
            <div className="w-16 h-16 lg:w-20 lg:h-20 bg-[#E8F1F8] rounded-full flex items-center justify-center mx-auto mb-4">
              <LogIn className="w-8 h-8 lg:w-10 lg:h-10 text-[#0F4C81]" />
            </div>
            <h1 className="text-2xl lg:text-3xl font-bold text-[#1F2A37] mb-2">ログイン</h1>
            <p className="text-[#5B6573] text-sm lg:text-base">感情ナビへようこそ</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 lg:space-y-5">
            {errorMessage && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {errorMessage}
              </div>
            )}

            {/* メールアドレス */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-[#5B6573] mb-2">
                メールアドレス
              </label>
              <input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-3 lg:py-4 rounded-lg border border-[#D9E1EA] bg-white text-[#1F2A37] placeholder:text-[#8A94A6] focus:ring-2 focus:ring-[#0F4C81]/20 focus:border-[#0F4C81] outline-none"
                placeholder="example@email.com"
                required
              />
            </div>

            {/* パスワード */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-[#5B6573] mb-2">
                パスワード
              </label>
              <input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-4 py-3 lg:py-4 rounded-lg border border-[#D9E1EA] bg-white text-[#1F2A37] placeholder:text-[#8A94A6] focus:ring-2 focus:ring-[#0F4C81]/20 focus:border-[#0F4C81] outline-none"
                placeholder="••••••••"
                required
              />
            </div>

            {/* パスワードを忘れた */}
            <div className="text-right">
              <button
                type="button"
                className="text-sm text-[#0F4C81] hover:text-[#0C3E69]"
              >
                パスワードを忘れた方
              </button>
            </div>

            {/* ログインボタン */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-[#0F4C81] text-white py-3 lg:py-4 rounded-lg font-semibold shadow-sm hover:bg-[#0C3E69] transition-colors lg:text-lg disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'ログイン中...' : 'ログイン'}
            </button>
          </form>

          {/* 新規登録 */}
          <div className="mt-6 lg:mt-8 pt-6 border-t border-[#D9E1EA] text-center">
            <p className="text-sm text-[#5B6573] mb-3">
              アカウントをお持ちでない方
            </p>
            <button
              type="button"
              onClick={() => navigate(`/register?returnTo=${encodeURIComponent(returnTo)}`)}
              className="w-full bg-white text-[#0F4C81] py-3 lg:py-4 rounded-lg font-medium border-2 border-[#D9E1EA] hover:bg-[#F1F4F8] transition-colors lg:text-lg"
            >
              新規登録
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
