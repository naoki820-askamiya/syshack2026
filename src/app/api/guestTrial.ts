import { captureAuthBoundary } from '../utils/authBoundary.js';

export interface GuestConfig {
  enabled: boolean; termsVersion?: string; privacyVersion?: string; consentVersion?: string; notice?: string;
}
export interface GuestPublicRun {
  id: string;
  state: 'RESERVED' | 'DISPATCH_AUTHORIZED' | 'SUCCEEDED' | 'FAILED_TERMINAL' | 'UNKNOWN' | 'CANCELLED';
  result: unknown | null; contentUnavailable: boolean; canStartNewIntent?: boolean;
}
export interface GuestSessionState {
  csrfToken: string; session: { consented: boolean; used: boolean }; run: GuestPublicRun | null;
}
export interface GuestInput {
  person: { displayName: string; relationshipType: string };
  currentCase: {
    userAgeRange: string; userGender: string; perceivedPartnerReaction: string; elapsedTimeType: string;
    eventFacts: string; userResponseType: 'action' | 'conversation' | 'none'; userResponseText: string | null;
  };
}
export class GuestApiError extends Error {
  constructor(readonly status: number, readonly code: string | undefined) {
    super(status === 404 ? 'ゲスト利用権を確認できません。Cookieを保存・送信できる設定か確認してください。'
      : status === 409 ? 'この利用権では新しく送信できません。「結果を確認する」で現在の状態を確認してください。'
        : status === 429 ? 'ゲスト利用の受付上限に達しました。通常ログインまたは固定デモをご利用ください。'
          : status === 400 ? '入力内容と同意内容を確認してください。'
            : status === 403 ? 'ゲスト利用の資格または同意を確認できません。'
              : 'ゲスト利用の状態を確認できません。再送せず「結果を確認する」を押してください。');
    this.name = 'GuestApiError';
  }
}

export function createGuestClient(send: (path: string, options: RequestInit) => Promise<Response>) {
  async function request<T>(path: string, method = 'GET', body?: unknown, csrfToken?: string, signal?: AbortSignal): Promise<T> {
    const boundary = captureAuthBoundary();
    const assertBoundary = () => {
      const current = captureAuthBoundary();
      if (boundary.userId !== null || current.userId !== null || boundary.epoch !== current.epoch) {
        throw new Error('ログイン状態が変わりました。ゲスト画面を開き直してください。');
      }
      signal?.throwIfAborted();
    };
    assertBoundary();
    const headers = new Headers({ 'Content-Type': 'application/json' });
    if (csrfToken) headers.set('X-Guest-CSRF', csrfToken);
    // Supabase credentials, business caches and automatic retries are never used here.
    const response = await send('/api/guest' + path, {
      method, headers, credentials: 'include', cache: 'no-store', signal,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    assertBoundary();
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { error?: { code?: unknown } } | null;
      assertBoundary();
      const code = typeof payload?.error?.code === 'string' && /^[A-Z_]{1,60}$/u.test(payload.error.code) ? payload.error.code : undefined;
      // Never display arbitrary provider/trace bodies, tokens or consultation text from an error.
      throw new GuestApiError(response.status, code);
    }
    const result = await response.json() as T;
    assertBoundary();
    return result;
  }
  return {
    config: (signal?: AbortSignal) => request<GuestConfig>('/config', 'GET', undefined, undefined, signal),
    session: (signal?: AbortSignal) => request<GuestSessionState>('/session', 'GET', undefined, undefined, signal),
    issue: () => request<GuestSessionState>('/session', 'POST', {}),
    consent: (csrf: string, config: GuestConfig) => request<GuestSessionState>('/consent', 'POST', {
      accepted: true, termsVersion: config.termsVersion, privacyVersion: config.privacyVersion, consentVersion: config.consentVersion,
    }, csrf),
    analyze: (csrf: string, intent: string, input: GuestInput) => request<{ run: GuestPublicRun }>('/analyze', 'POST', { intent, input }, csrf),
    erase: (csrf: string) => request<{ run: GuestPublicRun | null }>('/content', 'DELETE', {}, csrf),
  };
}

const serverUrl = import.meta.env?.VITE_SERVER_URL ?? '';
export const guestClient = createGuestClient((path, options) => fetch(serverUrl + path, options));
