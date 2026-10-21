import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { guestClient, GuestApiError, type GuestConfig, type GuestInput, type GuestPublicRun, type GuestSessionState } from '../api/guestTrial';
import { captureAuthBoundary } from '../utils/authBoundary';
import { normalizeAnalysis } from '../utils/analysisViewModel';

const emptyInput = (): GuestInput => ({ person: { displayName: '', relationshipType: 'friend' }, currentCase: {
  userAgeRange: '回答しない', userGender: '回答しない', perceivedPartnerReaction: '分からない', elapsedTimeType: '数時間後',
  eventFacts: '', userResponseType: 'none', userResponseText: null,
} });
const buttonClass = 'rounded-xl bg-[#0F4C81] px-4 py-3 text-white disabled:opacity-50';
export function guestConfigReady(config: GuestConfig | null): config is GuestConfig {
  return config?.enabled === true && !!config.termsVersion && !!config.privacyVersion && !!config.consentVersion && !!config.notice;
}
export function guestInputError(input: GuestInput): string {
  return !input.person.displayName.trim() || input.person.displayName.trim().length > 50
    || !input.currentCase.eventFacts.trim() || input.currentCase.eventFacts.trim().length > 3000
    ? 'ニックネーム（50文字まで）と起きた出来事（3000文字まで）を入力してください。まだ送信していません。' : '';
}

export function GuestTrial() {
  const { user, authEpoch, loading: authLoading } = useAuth();
  const [config, setConfig] = useState<GuestConfig | null>(null);
  const [session, setSession] = useState<GuestSessionState | null>(null);
  const [run, setRun] = useState<GuestPublicRun | null>(null);
  const [input, setInput] = useState(emptyInput);
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [demo, setDemo] = useState(false);
  const [stateEpoch, setStateEpoch] = useState(() => captureAuthBoundary().epoch);
  const lock = useRef(false);
  const intent = useRef<string | null>(null);
  const isPageCurrent = () => {
    const boundary = captureAuthBoundary();
    return boundary.userId === null && boundary.epoch === stateEpoch;
  };
  const visible = !user && isPageCurrent();

  useEffect(() => {
    const controller = new AbortController();
    const boundary = captureAuthBoundary();
    const current = () => !controller.signal.aborted && captureAuthBoundary().userId === null && captureAuthBoundary().epoch === boundary.epoch;
    setStateEpoch(boundary.epoch); setConfig(null); setSession(null); setRun(null); setInput(emptyInput());
    setAccepted(false); setError(''); setUncertain(false); setDemo(false); setPending(false);
    lock.current = false; intent.current = null;
    if (user || authLoading) { setLoading(false); return () => controller.abort(); }
    setLoading(true);
    // GET only: visiting, remounting or reloading never issues a trial or starts AI.
    void Promise.allSettled([
      guestClient.config(controller.signal),
      guestClient.session(controller.signal).catch((cause: unknown) => {
        if (cause instanceof GuestApiError && cause.status === 404) return null;
        throw cause;
      }),
    ]).then(([configResult, sessionResult]) => {
      if (!current()) return;
      if (configResult.status === 'fulfilled') setConfig(configResult.value);
      if (sessionResult.status === 'fulfilled') { setSession(sessionResult.value); setRun(sessionResult.value?.run ?? null); }
      if (configResult.status === 'rejected' || sessionResult.status === 'rejected') setError('ゲスト利用の状態を確認できません。新規送信はせず、結果の確認・通常ログインまたは固定デモをご利用ください。');
      setLoading(false);
    });
    return () => controller.abort();
  }, [user?.id, authEpoch, authLoading]);

  // Guard at publication as well as in transport: auth can change in the microtask
  // between resolving a request and resuming the page's continuation.
  async function operate(action: (commit: (publish: () => void) => void, assertCurrent: () => void) => Promise<void>) {
    if (lock.current || !visible) return;
    const boundary = captureAuthBoundary();
    // A handler retained from an old render must not adopt a new guest epoch.
    if (boundary.userId !== null || boundary.epoch !== stateEpoch) return;
    const current = () => captureAuthBoundary().userId === null && captureAuthBoundary().epoch === boundary.epoch;
    const assertCurrent = () => { if (!current()) throw new Error('Guest boundary changed'); };
    const commit = (publish: () => void) => { assertCurrent(); publish(); };
    lock.current = true; setPending(true); setError('');
    try { await action(commit, assertCurrent); }
    catch (cause) { if (current()) setError(cause instanceof GuestApiError ? cause.message : '操作の結果を確認できません。再送せず「結果を確認する」を押してください。'); }
    finally { if (current()) { lock.current = false; setPending(false); } }
  }
  async function issue() {
    await operate(async (commit, assertCurrent) => {
      await guestClient.issue(); assertCurrent();
      // Verify the browser returns the HttpOnly cookie before accepting any analysis.
      const verified = await guestClient.session();
      commit(() => { setSession(verified); setRun(verified.run); });
    });
  }
  async function consent() {
    if (!session || !accepted || !guestConfigReady(config)) return;
    await operate(async commit => {
      const next = await guestClient.consent(session.csrfToken, config);
      commit(() => { setSession(next); setRun(next.run); });
    });
  }
  async function analyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isPageCurrent()) return;
    if (!session || !session.session.consented || run || uncertain || !guestConfigReady(config)) return;
    const invalid = guestInputError(input);
    if (invalid) { setError(invalid); return; }
    await operate(async commit => {
      intent.current ??= crypto.randomUUID();
      // A lost response may conceal a dispatch. Never blindly resubmit it.
      commit(() => setUncertain(true));
      try {
        const response = await guestClient.analyze(session.csrfToken, intent.current, input);
        commit(() => { setRun(response.run); setInput(emptyInput()); });
      } catch (cause) {
        if (cause instanceof GuestApiError && cause.status === 400) commit(() => setUncertain(false));
        throw cause;
      }
    });
  }
  async function refresh() {
    await operate(async commit => {
      const next = await guestClient.session();
      commit(() => { setSession(next); setRun(next.run); setUncertain(next.session.used || !!next.run); });
    });
  }
  async function erase() {
    if (!session) return;
    await operate(async commit => {
      const response = await guestClient.erase(session.csrfToken);
      commit(() => { setRun(response.run); setInput(emptyInput()); setUncertain(true); });
    });
  }
  function returnToInput() {
    if (!isPageCurrent() || !visible || lock.current || run?.state !== 'CANCELLED' || run.canStartNewIntent !== true) return;
    intent.current = null; setRun(null); setUncertain(false); setError(''); setInput(emptyInput());
    setSession(previous => previous ? { ...previous, run: null, session: { ...previous.session, used: false } } : null);
  }
  const shownRun = visible ? run : null;
  const view = shownRun?.result && !shownRun.contentUnavailable ? normalizeAnalysis({ result: { analysis: shownRun.result } }) : null;
  const canBegin = visible && guestConfigReady(config);
  return <main className="min-h-screen bg-[#F7F9FC] px-4 py-8 text-[#1F2A37]">
    <div className="mx-auto max-w-2xl space-y-6">
      <Link to="/" className="text-[#0F4C81] underline">ホームへ戻る</Link>
      <h1 className="text-2xl font-semibold">ログインなしで1回試す</h1>
      <p>ゲスト利用権ごとの送信は最大1回です。成功や「1人1回」を保証するものではありません。Cookieの削除や別端末では同じ人と識別できません。</p>
      {user ? <p role="status">ログイン中です。<Link to="/new" className="underline">通常の相談を作成する</Link></p>
        : loading || authLoading ? <p role="status">利用状態を確認しています…</p>
          : !canBegin ? <p role="status">現在、ゲスト利用は受付していません。</p> : null}
      {visible && error && <p role="alert" className="rounded-xl border border-red-200 p-4 text-red-800">{error}</p>}
      {visible && error && !shownRun && !uncertain && !session?.session.used && <button type="button" disabled={pending} onClick={() => void refresh()} className={buttonClass}>結果を確認する</button>}
      {visible && pending && <p role="status" aria-live="polite">処理中です。送信を繰り返さずお待ちください。</p>}
      {canBegin && !loading && !session && <button type="button" disabled={pending} onClick={() => void issue()} className={buttonClass}>ゲスト利用権を発行する</button>}
      {canBegin && session && !session.session.consented && !shownRun && <section aria-labelledby="guest-consent-title" className="space-y-4 rounded-2xl border bg-white p-5">
        <h2 id="guest-consent-title" className="text-xl font-semibold">送信前の確認</h2>
        <p className="whitespace-pre-wrap">{config?.notice}</p>
        <p><Link to="/terms" target="_blank" rel="noopener noreferrer" className="underline">利用規約</Link>・<Link to="/privacy-policy" target="_blank" rel="noopener noreferrer" className="underline">プライバシーポリシー</Link></p>
        <label className="flex gap-3"><input type="checkbox" checked={accepted} disabled={pending} onChange={event => setAccepted(event.target.checked)} />ゲスト利用の説明と表示された規約・プライバシーポリシーに同意します。</label>
        <button type="button" disabled={!accepted || pending} onClick={() => void consent()} className={buttonClass}>同意して入力へ進む</button>
      </section>}
      {canBegin && session?.session.consented && !session.session.used && !shownRun && !uncertain && <form onSubmit={event => void analyze(event)} className="space-y-4 rounded-2xl border bg-white p-5">
        <h2 className="text-xl font-semibold">今回の状況</h2>
        <p>実名・連絡先は入力しないでください。過去の相談や人物情報は参照しません。</p>
        <label className="block">ニックネーム（必須）<input required maxLength={50} value={input.person.displayName} disabled={pending} onChange={event => setInput(value => ({ ...value, person: { ...value.person, displayName: event.target.value } }))} className="mt-1 block w-full rounded-lg border p-3" /></label>
        <label className="block">相手との関係<select value={input.person.relationshipType} disabled={pending} onChange={event => setInput(value => ({ ...value, person: { ...value.person, relationshipType: event.target.value } }))} className="mt-1 block w-full rounded-lg border p-3"><option value="friend">友人</option><option value="coworker">同僚</option><option value="family">家族</option><option value="other">その他</option></select></label>
        <label className="block">起きた出来事（必須・3000文字まで）<textarea required maxLength={3000} rows={5} value={input.currentCase.eventFacts} disabled={pending} onChange={event => setInput(value => ({ ...value, currentCase: { ...value.currentCase, eventFacts: event.target.value } }))} className="mt-1 block w-full rounded-lg border p-3" /></label>
        <button type="submit" disabled={pending} className={buttonClass}>1回だけ送信して分析する</button>
      </form>}
      {visible && (shownRun || uncertain || session?.session.used) && <section aria-labelledby="guest-state-title" className="space-y-4 rounded-2xl border bg-white p-5">
        <h2 id="guest-state-title" className="text-xl font-semibold">ゲスト利用の結果</h2>
        <p role="status">{pending && !shownRun ? '分析を処理しています。送信を繰り返さずお待ちください。'
          : shownRun?.state === 'CANCELLED' && shownRun.canStartNewIntent === true ? '送信前に処理を取り消しました。古い入力は削除されています。'
          : shownRun?.contentUnavailable ? '内容は削除されたか、閲覧期限を過ぎています。利用済みの記録は残ります。'
          : shownRun?.state === 'SUCCEEDED' ? '分析が完了しました。登録せずに結果を確認できます。'
            : shownRun?.state === 'FAILED_TERMINAL' ? '分析は終了しましたが、表示できる結果がありません。再送はできません。'
              : shownRun?.state === 'CANCELLED' ? '送信前に処理を取り消しました。現在の利用状態を確認してください。'
                : shownRun?.state === 'UNKNOWN' || uncertain && !shownRun ? '送信の結果を確定できません。利用権と費用の予約は保持され、自動再送しません。'
                  : '処理状態を確認中です。確認操作は新しい分析を開始しません。'}</p>
        {view?.contentBlocked ? <p role="alert">安全性を確認できないため、返信案の表示を停止しました。</p> : view && <div className="space-y-4">
          <h3 className="font-semibold">状況の整理</h3><p>{view.summary}</p><p>{view.textImpression}</p><p>{view.balancedView}</p>
          <h3 className="font-semibold">行動の候補</h3><ul className="list-disc pl-5">{view.recommendedActions.map((item, index) => <li key={index}>{item.label}：{item.reason}</li>)}</ul>
          <h3 className="font-semibold">返信例</h3>{view.replyDrafts.map((draft, index) => <p key={index} className="whitespace-pre-wrap rounded-lg bg-[#F7F9FC] p-3">{draft.text}</p>)}
          <p className="text-sm">{view.disclaimer}</p>
        </div>}
        <div className="flex flex-wrap gap-3"><button type="button" disabled={pending} onClick={() => void refresh()} className={buttonClass}>結果を確認する</button>
          <button type="button" disabled={pending || !session || shownRun?.contentUnavailable} onClick={() => void erase()} className="rounded-xl border px-4 py-3 disabled:opacity-50">入力と結果を削除する</button></div>
        {shownRun?.state === 'CANCELLED' && shownRun.canStartNewIntent === true && canBegin && <button type="button" disabled={pending} onClick={returnToInput} className={buttonClass}>新しい入力に戻る</button>}
      </section>}
      <section className="space-y-3 border-t pt-5"><p><Link to="/login" className="text-[#0F4C81] underline">通常ログインして利用する</Link> / <Link to="/register" className="text-[#0F4C81] underline">任意で新規登録する</Link></p>
        <p className="text-sm">登録後は通常の利用上限が適用されます。ゲストの入力・結果は自動で引き継がれず、使用済み記録も消えません。</p>
        <button type="button" onClick={() => setDemo(value => !value)} className="text-[#0F4C81] underline">固定デモを{demo ? '閉じる' : '見る'}</button>
        {demo && <div className="space-y-2 rounded-xl border bg-white p-4"><h2 className="font-semibold">固定デモ（AI送信なし）</h2><p>例：予定確認への返事が短く、不安になった。</p><p>短い返事だけでは感情を断定できません。忙しいなど別の見方もあります。</p><p>返信の例：「都合のよいときに、予定を確認してもらえると助かります。」</p><p>これは固定の説明用サンプルです。あなたの入力を分析した結果ではありません。</p></div>}
      </section>
    </div>
  </main>;
}
