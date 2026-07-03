import { useNavigate } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { Navigation } from '../components/Navigation';

export function ProtectedPlaceholder({ title }: { title: string }) {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#F7F9FC]">
      <Navigation />
      <div className="lg:ml-64 pb-24 lg:pb-8">
        <div className="bg-white border-b border-[#D9E1EA] p-4 lg:px-8 sticky top-0 z-10">
          <div className="max-w-4xl mx-auto flex items-center gap-3">
            <button onClick={() => navigate('/')} className="text-[#5B6573] hover:text-[#1F2A37]">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <h1 className="text-xl lg:text-2xl font-semibold">{title}</h1>
          </div>
        </div>
        <div className="max-w-4xl mx-auto p-4 lg:p-8">
          <div className="bg-white rounded-2xl border border-[#D9E1EA] p-6 shadow-sm">
            <p className="text-[#5B6573]">この画面はログインユーザー向けの準備中ページです。</p>
          </div>
        </div>
      </div>
    </div>
  );
}
