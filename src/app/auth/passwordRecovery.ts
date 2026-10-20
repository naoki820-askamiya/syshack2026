import { createClient } from '@supabase/supabase-js';
import { captureAuthBoundary, subscribeAuthBoundary } from '../utils/authBoundary.js';

export const RECOVERY_LIFETIME_MS = 10 * 60_000;
export const RESET_REQUEST_INTERVAL_MS = 60_000;
export const RESET_REQUEST_MESSAGE = '登録されている場合は再設定メールが届きます。届かない場合は迷惑メールを確認し、時間をおいて再度お試しください。';
export const INVALID_RECOVERY_MESSAGE = 'このリンクは無効か、期限切れ・使用済みです。再設定メールをもう一度依頼してください。';
export const CHANGED_RECOVERY_MESSAGE = 'ログイン状態が変わったため中止しました。再設定メールをもう一度依頼してください。';
export const UNKNOWN_PASSWORD_RESULT = '保存結果を確認できませんでした。新しいパスワードでログインを試し、できない場合は再設定メールを依頼してください。';

type Phase = 'link' | 'verifying' | 'ready' | 'saving' | 'complete' | 'invalid';
export type RecoveryState = Readonly<{ phase: Phase; message: string }>;
type AuthClient = ReturnType<typeof createClient>['auth'];
type RecoveryClient = Pick<AuthClient, 'verifyOtp' | 'updateUser' | 'signOut'>;
export type RecoveryConfig = { url: string; key: string; enabled: boolean };

async function quietFetch(transport: typeof fetch, input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response> {
  try { return await transport(input, init); }
  catch {
    // The installed Auth SDK logs thrown fetch errors. Contain them here so an
    // exception containing provider/request details never reaches its logger.
    return new Response(JSON.stringify({ code: 'recovery_unavailable', message: 'Request unavailable' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } });
  }
}

export function recoveryRedirect(origin: string): string {
  const url = new URL(origin);
  if (url.origin !== origin || (url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) {
    throw new Error('再設定の戻り先を確認してください。');
  }
  return new URL('/reset-password', url).href;
}

// No account-specific error or provider text escapes to the UI. The caller shows
// the same neutral result immediately, independent of provider response timing.
export async function sendRecoveryEmail(config: RecoveryConfig, email: string, origin: string,
  transport: typeof fetch = fetch): Promise<void> {
  if (!config.enabled) throw new Error('パスワード再設定は準備中です。');
  const redirectTo = recoveryRedirect(origin);
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 15_000);
  try {
    const client = createClient(config.url, config.key, { auth: {
      persistSession: false, autoRefreshToken: false, detectSessionInUrl: false,
      storageKey: 'kigen-recovery-request',
    }, global: { fetch: (input, init) => quietFetch(transport, input, { ...init, signal: abort.signal }) } });
    await client.auth.resetPasswordForEmail(email, { redirectTo });
  } catch { /* A neutral receipt never asserts that a message was delivered. */ }
  finally { clearTimeout(timer); }
}

export class PasswordRecovery {
  private state: RecoveryState;
  private listeners = new Set<() => void>();
  private boundary = captureAuthBoundary();
  private unsubscribe: () => void;
  private abort = new AbortController();
  private client: RecoveryClient | null = null;
  private token: string | null;
  private accessToken: string | null = null;
  private sessionUserId: string | null = null;
  private expiresAt = 0;
  private deadline: number;
  private timer: ReturnType<typeof setTimeout>;
  private verifySent = false;
  private refreshDenied = false;
  private passwordSaved = false;

  constructor(token: string | null, private config: RecoveryConfig,
    private transport: typeof fetch = fetch, private now = Date.now,
    private makeClient: typeof createClient = createClient) {
    this.token = token;
    this.deadline = now() + RECOVERY_LIFETIME_MS;
    this.state = { phase: token && config.enabled ? 'link' : 'invalid', message: INVALID_RECOVERY_MESSAGE };
    this.unsubscribe = subscribeAuthBoundary(() => this.invalidate(CHANGED_RECOVERY_MESSAGE));
    this.timer = setTimeout(() => this.invalidate(), RECOVERY_LIFETIME_MS);
  }

  getSnapshot = (): RecoveryState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private publish(phase: Phase, message = '') {
    this.state = { phase, message };
    this.listeners.forEach(listener => listener());
  }
  private current() {
    return !this.abort.signal.aborted && captureAuthBoundary() === this.boundary &&
      this.now() < this.deadline;
  }
  invalidate = (message = INVALID_RECOVERY_MESSAGE): void => {
    if (this.state.phase === 'complete') return;
    const alreadyInvalid = this.state.phase === 'invalid';
    if (this.state.phase === 'saving') message = this.passwordSaved ?
      'パスワードを変更しました。ログアウトの結果を確認できませんでした。新しいパスワードでログインしてください。' : UNKNOWN_PASSWORD_RESULT;
    this.token = null;
    this.accessToken = null;
    this.sessionUserId = null;
    this.client = null;
    this.abort.abort();
    clearTimeout(this.timer);
    this.unsubscribe();
    if (!alreadyInvalid) this.publish('invalid', message);
  };

  // The only transport the private SDK can use. No refresh, arbitrary endpoint,
  // account switch or stale operation can dispatch a provider request.
  private guardedFetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const authRoot = new URL('/auth/v1/', this.config.url);
    const method = init?.method;
    let allowed = this.current() && !this.refreshDenied && url.origin === authRoot.origin;
    if (url.pathname === authRoot.pathname + 'verify' && method === 'POST') {
      const body = JSON.parse(String(init?.body));
      allowed &&= !this.verifySent && body.type === 'recovery' && body.token_hash === this.token;
      this.verifySent = true;
    } else {
      const bearer = new Headers(init?.headers).get('Authorization');
      allowed &&= this.accessToken !== null && bearer === 'Bearer ' + this.accessToken &&
        this.now() + 60_000 < this.expiresAt;
      allowed &&= (url.pathname === authRoot.pathname + 'user' && method === 'PUT') ||
        (url.pathname === authRoot.pathname + 'logout' && method === 'POST' && url.search === '?scope=global');
    }
    if (!allowed) {
      this.refreshDenied = true;
      return new Response(JSON.stringify({ code: 'recovery_expired', message: 'Recovery unavailable' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    return quietFetch(this.transport, input, { ...init, signal: this.abort.signal });
  };

  async verify(): Promise<void> {
    if (this.state.phase !== 'link') return;
    if (!this.current() || !this.token) { this.invalidate(); return; }
    this.publish('verifying');
    const timeout = setTimeout(() => this.invalidate(), 15_000);
    try {
      const client = this.makeClient(this.config.url, this.config.key, { auth: {
        persistSession: false, autoRefreshToken: false, detectSessionInUrl: false,
        storageKey: 'kigen-password-recovery',
      }, global: { fetch: this.guardedFetch } }).auth;
      this.client = client;
      const { data, error } = await client.verifyOtp({ token_hash: this.token, type: 'recovery' });
      this.token = null;
      if (!this.current()) return;
      if (error || !data.session || !data.user || data.user.id !== data.session.user.id ||
        !data.session.expires_at || data.session.expires_at * 1000 <= this.now() + 60_000) {
        this.invalidate(); return;
      }
      this.accessToken = data.session.access_token;
      this.sessionUserId = data.user.id;
      this.expiresAt = data.session.expires_at * 1000;
      this.publish('ready');
    } catch { this.invalidate(); }
    finally { clearTimeout(timeout); }
  }

  async save(password: string, confirmation: string): Promise<void> {
    if (this.state.phase !== 'ready') return;
    if (!this.current() || this.now() + 60_000 >= this.expiresAt || !this.client) {
      this.invalidate(); return;
    }
    if (password.length < 8 || password !== confirmation) {
      this.publish('ready', password !== confirmation ? 'パスワードが一致しません。' : 'パスワードは8文字以上で入力してください。');
      return;
    }
    const client = this.client;
    this.publish('saving');
    const timeout = setTimeout(() => this.invalidate(), 20_000);
    try {
      const { data, error } = await client.updateUser({ password });
      if (!this.current()) return;
      if (error) {
        if (error.code === 'weak_password' || error.code === 'same_password') {
          this.publish('ready', error.code === 'same_password' ? '現在と異なるパスワードを入力してください。' :
            'より安全なパスワードを入力してください。長く、推測されにくいものにしてください。');
        } else {
          this.invalidate();
        }
        return;
      }
      if (!data.user || data.user.id !== this.sessionUserId) { this.invalidate(); return; }
      this.passwordSaved = true;
      // Explicitly end existing refresh sessions; the main singleton is never
      // called and cannot accidentally sign a newly logged-in B out.
      let logoutError = false;
      try { logoutError = Boolean((await client.signOut({ scope: 'global' })).error); }
      catch { logoutError = true; }
      if (!this.current()) return;
      clearTimeout(this.timer);
      this.unsubscribe();
      this.accessToken = null;
      this.sessionUserId = null;
      this.client = null;
      this.abort.abort();
      this.publish('complete', logoutError ?
        'パスワードを変更しました。ほかの端末のログアウトは確認できませんでした。共有端末ではログアウトしてください。' :
        'パスワードを変更しました。新しいパスワードでログインしてください。');
    } catch {
      this.invalidate();
    } finally { clearTimeout(timeout); }
  }
}
