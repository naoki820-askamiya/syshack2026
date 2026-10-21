import { Link } from 'react-router';
import { LegalLinks } from '../components/LegalLinks';
import { legalDraftNotice, privacyDocument, termsDocument } from '../legal/documents';

export function LegalDocument({ kind }: { kind: 'terms' | 'privacy' }) {
  const document = kind === 'terms' ? termsDocument : privacyDocument;
  return <div className="min-h-screen bg-[#F7F9FC] px-4 py-8">
    <main className="analysis-reading mx-auto max-w-3xl space-y-6 rounded-2xl border border-[#D9E1EA] bg-white p-5 sm:p-8">
      <Link to="/" className="text-sm text-[#0F4C81] underline">ホームへ</Link>
      <header><h1 className="text-2xl font-semibold">{document.title}</h1><p className="mt-2 text-sm text-[#5B6573]">文書版：{document.version}</p></header>
      <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{legalDraftNotice}</p>
      {document.sections.map(section => <section key={section.title} className="space-y-3">
        <h2 className="text-lg font-semibold">{section.title}</h2>
        {section.paragraphs.map(paragraph => <p key={paragraph} className="text-sm text-[#5B6573]">{paragraph}</p>)}
      </section>)}
      {kind === 'privacy' && <section className="space-y-2 text-sm"><h2 className="text-lg font-semibold">外部サービスの説明</h2>
        <p><a className="text-[#0F4C81] underline" href="https://developers.openai.com/api/docs/guides/your-data" target="_blank" rel="noopener noreferrer">OpenAI APIのデータの取扱い</a></p>
        <p><a className="text-[#0F4C81] underline" href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer">Supabaseのプライバシーポリシー</a></p>
      </section>}
      <LegalLinks />
    </main>
  </div>;
}
