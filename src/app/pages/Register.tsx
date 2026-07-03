import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ArrowLeft, UserPlus } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

export function Register() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signUp } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [noticeMessage, setNoticeMessage] = useState('');

  const returnTo = searchParams.get('returnTo') || '/new';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setNoticeMessage('');
    
    if (formData.password !== formData.confirmPassword) {
      setErrorMessage('パスワードが一致しません。');
      return;
    }
    
    setIsSubmitting(true);

    try {
      const result = await signUp(
        formData.email.trim(),
        formData.password,
        formData.name.trim(),
      );

      if (result.needsEmailConfirmation) {
        setNoticeMessage('確認メールを送信しました。メール内のリンクを開いてからログインしてください。');
        return;
      }

      navigate(returnTo, { replace: true });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '新規登録に失敗しました。');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F9FC] flex items-center justify-center p-4 lg:p-8">
      <div className="w-full max-w-md lg:max-w-lg">
        {/* 戻るボタン */}
        <button
          onClick={() => navigate('/login')}
          className="flex items-center gap-2 text-[#5B6573] hover:text-[#1F2A37] mb-6 lg:mb-8"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>戻る</span>
        </button>

        {/* 登録カード */}
        <div className="bg-white rounded-2xl p-8 lg:p-10 shadow-sm border border-[#D9E1EA]">
          <div className="text-center mb-8">
            <div className="w-16 h-16 lg:w-20 lg:h-20 bg-[#E8F1F8] rounded-full flex items-center justify-center mx-auto mb-4">
              <UserPlus className="w-8 h-8 lg:w-10 lg:h-10 text-[#0F4C81]" />
            </div>
            <h1 className="text-2xl lg:text-3xl font-bold text-[#1F2A37] mb-2">新規登録</h1>
            <p className="text-[#5B6573] text-sm lg:text-base">感情ナビを始めましょう</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 lg:space-y-5">
            {errorMessage && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {errorMessage}
              </div>
            )}
            {noticeMessage && (
              <div className="rounded-lg border border-[#B9DDBB] bg-[#EAF6EF] px-4 py-3 text-sm text-[#1F7A4D]">
                {noticeMessage}
              </div>
            )}

            {/* 名前 */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-[#5B6573] mb-2">
                お名前
              </label>
              <input
                id="name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-3 lg:py-4 rounded-lg border border-[#D9E1EA] bg-white text-[#1F2A37] placeholder:text-[#8A94A6] focus:ring-2 focus:ring-[#0F4C81]/20 focus:border-[#0F4C81] outline-none"
                placeholder="山田太郎"
                required
              />
            </div>

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
                placeholder="8文字以上"
                required
                minLength={8}
              />
            </div>

            {/* パスワード確認 */}
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-[#5B6573] mb-2">
                パスワード（確認）
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                className="w-full px-4 py-3 lg:py-4 rounded-lg border border-[#D9E1EA] bg-white text-[#1F2A37] placeholder:text-[#8A94A6] focus:ring-2 focus:ring-[#0F4C81]/20 focus:border-[#0F4C81] outline-none"
                placeholder="もう一度入力してください"
                required
              />
            </div>

            {/* 登録ボタン */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-[#0F4C81] text-white py-3 lg:py-4 rounded-lg font-semibold shadow-sm hover:bg-[#0C3E69] transition-colors mt-6 lg:text-lg disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting ? '登録中...' : '登録する'}
            </button>
          </form>

          {/* ログイン */}
          <div className="mt-6 lg:mt-8 pt-6 border-t border-[#D9E1EA] text-center">
            <p className="text-sm text-[#5B6573]">
              すでにアカウントをお持ちの方は
              <button
                type="button"
                onClick={() => navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`)}
                className="text-[#0F4C81] hover:text-[#0C3E69] font-medium ml-1"
              >
                ログイン
              </button>
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
