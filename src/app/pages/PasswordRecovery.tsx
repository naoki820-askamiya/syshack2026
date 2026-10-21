import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode, FormEvent } from 'react';
import { Link } from 'react-router';
import { getPasswordRecovery, passwordRecoveryEnabled, recoveryRequestAllowedAt, requestPasswordReset } from '../auth/recoveryRuntime';
import { RESET_REQUEST_MESSAGE } from '../auth/passwordRecovery';

const field = 'w-full min-h-12 rounded-lg border border-[#D9E1EA] bg-white px-4 py-3 text-base text-[#1F2A37] focus:outline-2 focus:outline-[#0F4C81]';
const button = 'w-full min-h-12 rounded-lg bg-[#0F4C81] px-4 py-3 font-semibold text-white disabled:opacity-60';

function RecoveryLayout({ title, children }: { title: string; children: ReactNode }) {
  return <main className="min-h-screen bg-[#F7F9FC] px-4 py-8 flex items-center justify-center">
    <section className="w-full max-w-md rounded-2xl border border-[#D9E1EA] bg-white p-6 sm:p-8 space-y-5" aria-labelledby="recovery-heading">
      <h1 id="recovery-heading" className="text-2xl font-bold text-[#1F2A37]" tabIndex={-1}>{title}</h1>
      {children}
    </section>
  </main>;
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [now, setNow] = useState(Date.now);
  const remaining = Math.max(0, Math.ceil((recoveryRequestAllowedAt() - now) / 1000));
  useEffect(() => {
    document.getElementById('recovery-heading')?.focus();
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (requestPasswordReset(email.trim())) { setSent(true); setNow(Date.now()); }
  };
  return <RecoveryLayout title="パスワードの再設定">
    <p className="text-sm text-[#5B6573]">登録したメールアドレスを入力してください。メールのリンクから新しいパスワードを設定できます。</p>
    {!passwordRecoveryEnabled ? <p role="status">パスワード再設定は準備中です。しばらくしてからお試しください。</p> :
      <form onSubmit={submit} className="space-y-4">
        <label htmlFor="recovery-email" className="block text-sm font-medium">メールアドレス</label>
        <input id="recovery-email" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false}
          className={field} required value={email} onChange={event => setEmail(event.target.value)} aria-describedby={sent ? 'recovery-receipt' : undefined} />
        {sent && <p id="recovery-receipt" role="status" className="text-sm text-[#5B6573]">{RESET_REQUEST_MESSAGE}</p>}
        <button type="submit" className={button} disabled={remaining > 0}>{remaining > 0 ? `再送は${remaining}秒後` : sent ? '再設定メールを再依頼する' : '再設定メールを依頼する'}</button>
        <p className="text-sm text-[#5B6573]">メールが届くまで数分かかる場合があります。再依頼するときは60秒以上お待ちください。</p>
      </form>}
    <Link className="inline-flex min-h-11 items-center text-[#0F4C81] underline" to="/login">ログインに戻る</Link>
  </RecoveryLayout>;
}

export function ResetPassword() {
  const [flow] = useState(getPasswordRecovery);
  const state = useSyncExternalStore(flow.subscribe, flow.getSnapshot);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const form = useRef<HTMLFormElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const busy = state.phase === 'verifying' || state.phase === 'saving';
  useEffect(() => {
    document.getElementById('recovery-heading')?.focus();
    return () => flow.invalidate();
  }, [flow]);
  useEffect(() => {
    if (state.phase === 'invalid' || state.phase === 'complete') {
      setPassword(''); setConfirmation(''); form.current?.reset();
    }
    if (state.message) status.current?.focus();
    else if (state.phase === 'ready') document.getElementById('new-password')?.focus();
  }, [state]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void flow.save(password, confirmation);
  };
  return <RecoveryLayout title="新しいパスワード">
    {state.phase === 'link' && <>
      <p className="text-sm text-[#5B6573]">ご自身で依頼したメールであることを確認して、再設定を始めてください。</p>
      <button type="button" className={button} onClick={() => void flow.verify()}>リンクを確認して続ける</button>
    </>}
    <div aria-busy={busy}>
      {busy && <p role="status">{state.phase === 'verifying' ? 'リンクを確認しています…' : '保存しています。この画面のままお待ちください…'}</p>}
      {(state.phase === 'ready' || state.phase === 'saving') && <form ref={form} onSubmit={submit} className="space-y-4">
        <p id="password-help" className="text-sm text-[#5B6573]">8文字以上の、推測されにくいパスワードを入力してください。保存後は新しいパスワードでログインしてください。</p>
        <label htmlFor="new-password" className="block text-sm font-medium">新しいパスワード</label>
        <input id="new-password" name="new-password" type="password" autoComplete="new-password" minLength={8} required
          className={field} value={password} onChange={event => setPassword(event.target.value)} disabled={busy} aria-describedby="password-help recovery-result" />
        <label htmlFor="confirm-password" className="block text-sm font-medium">新しいパスワード（確認）</label>
        <input id="confirm-password" name="confirm-password" type="password" autoComplete="new-password" minLength={8} required
          className={field} value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={busy} aria-describedby="recovery-result" />
        <button type="submit" className={button} disabled={busy}>パスワードを保存する</button>
      </form>}
    </div>
    {state.message && state.phase !== 'link' && <p ref={status} id="recovery-result" tabIndex={-1}
      role={state.phase === 'complete' ? 'status' : 'alert'} className="text-sm text-[#1F2A37]">{state.message}</p>}
    {state.phase !== 'complete' && <Link to="/forgot-password" className="flex min-h-11 items-center text-[#0F4C81] underline">再設定メールをもう一度依頼する</Link>}
    <a href="/login" className="flex min-h-11 items-center text-[#0F4C81] underline">ログインに戻る</a>
  </RecoveryLayout>;
}
