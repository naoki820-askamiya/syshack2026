import { captureAuthBoundary, type AuthBoundary } from '../utils/authBoundary.js';

type SessionResponse = { data: { session: { access_token: string } | null } };
type ApiTransport = {
  getSession: () => Promise<SessionResponse>;
  send: (endpoint: string, options: RequestInit) => Promise<Response>;
};

export class StaleAuthResponseError extends Error {
  readonly code = 'AUTH_RESPONSE_STALE';

  constructor() {
    super('ログイン状態が変わりました。もう一度操作してください。');
    this.name = 'StaleAuthResponseError';
  }
}

// Response isolation only: not authentication, authorization, or a before-send gate.
function assertCurrentResponse(boundary: AuthBoundary): void {
  const current = captureAuthBoundary();
  if (boundary.userId !== current.userId || boundary.epoch !== current.epoch) {
    throw new StaleAuthResponseError();
  }
}

async function buildApiError(response: Response): Promise<Error> {
  const payload = await response.json().catch(() => null) as {
    error?: { message?: string; requestId?: string };
  } | null;
  const requestId = payload?.error?.requestId;
  const suffix = requestId ? `（問い合わせID: ${requestId}）` : '';
  return new Error(`${payload?.error?.message ?? `APIエラー: ${response.status}`}${suffix}`);
}

// The existing protected transport, with injectable I/O for response-race regressions.
export function createApiClient({ getSession, send }: ApiTransport) {
  async function request(endpoint: string, options: RequestInit): Promise<Response> {
    const { data } = await getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) throw new Error('ログインが必要です。');

    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${accessToken}`);
    if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await send(endpoint, { ...options, headers });
    if (!response.ok) throw await buildApiError(response);
    return response;
  }

  async function fetchApi(endpoint: string, options: RequestInit = {}): Promise<Response> {
    const boundary = captureAuthBoundary();
    const response = await request(endpoint, options);
    assertCurrentResponse(boundary);
    return response;
  }

  async function fetchApiJson<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const boundary = captureAuthBoundary();
    const response = await request(endpoint, options);
    assertCurrentResponse(boundary);
    const payload = await response.json() as T;
    assertCurrentResponse(boundary);
    return payload;
  }

  return { fetchApi, fetchApiJson };
}
