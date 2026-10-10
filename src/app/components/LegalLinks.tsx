import { Link } from 'react-router';

export function LegalLinks() {
  return <nav aria-label="規約・個人情報の取扱い" className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-[#0F4C81]">
    <Link className="underline underline-offset-4" to="/terms" target="_blank" rel="noopener noreferrer">利用規約</Link>
    <Link className="underline underline-offset-4" to="/privacy-policy" target="_blank" rel="noopener noreferrer">プライバシーポリシー</Link>
  </nav>;
}
