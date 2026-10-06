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

export class StaleAuthWriteIntentError extends Error {
  readonly code = 'AUTH_WRITE_INTENT_STALE';

  constructor() {
    super('ログイン状態が変わりました。もう一度操作してください。');
    this.name = 'StaleAuthWriteIntentError';
  }
}

// These guards isolate client intent/results; the server still authenticates and checks ownership.
function assertCurrentResponse(boundary: AuthBoundary): void {
  const current = captureAuthBoundary();
  if (boundary.userId !== current.userId || boundary.epoch !== current.epoch) {
    throw new StaleAuthResponseError();
  }
}

// Race token lookup and body parsing too: these operations can outlive fetch cancellation.
// Always observe the underlying promise and release the listener on every settlement.
export function awaitApiOperation<T>(operation: () => Promise<T>, signal?: AbortSignal | null): Promise<T> {
  signal?.throwIfAborted();
  if (!signal) return operation();
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (accept: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      accept();
    };
    const onAbort = () => finish(() => reject(signal.reason));
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve().then(() => { signal.throwIfAborted(); return operation(); })
      .then(value => finish(() => resolve(value)), error => finish(() => reject(error)));
  });
}

export class ApiResponseError extends Error {
  constructor(readonly status: number, readonly code: string | undefined, readonly requestId: string | undefined, message: string) {
    super(message);
    this.name = 'ApiResponseError';
  }
}

async function buildApiError(response: Response, signal?: AbortSignal | null): Promise<Error> {
  const payload = await awaitApiOperation(() => response.json().catch(() => null), signal) as {
    error?: { message?: string; requestId?: string; code?: string };
  } | null;
  const requestId = payload?.error?.requestId;
  const suffix = requestId ? `（問い合わせID: ${requestId}）` : '';
  return new ApiResponseError(response.status, payload?.error?.code, requestId, `${payload?.error?.message ?? `APIエラー: ${response.status}`}${suffix}`);
}

// The existing protected transport, with injectable I/O for response-race regressions.
export function createApiClient({ getSession, send }: ApiTransport) {
  async function request(endpoint: string, options: RequestInit, boundary: AuthBoundary): Promise<Response> {
    const { data } = await awaitApiOperation(getSession, options.signal);
    const accessToken = data.session?.access_token;
    if (!accessToken) throw new Error('ログインが必要です。');

    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${accessToken}`);
    if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const requestOptions = { ...options, headers };
    const response = await awaitApiOperation(() => {
      // Check at the exact dispatch; the signal race can introduce a microtask after token lookup.
      requestOptions.signal?.throwIfAborted();
      if (['POST', 'PATCH', 'PUT', 'DELETE'].includes((requestOptions.method ?? 'GET').toUpperCase())) {
        const current = captureAuthBoundary();
        if (boundary.userId !== current.userId || boundary.epoch !== current.epoch) {
          throw new StaleAuthWriteIntentError();
        }
      }
      return send(endpoint, requestOptions);
    }, requestOptions.signal);
    if (!response.ok) throw await buildApiError(response, requestOptions.signal);
    return response;
  }

  async function fetchApi(endpoint: string, options: RequestInit = {}): Promise<Response> {
    const boundary = captureAuthBoundary();
    const response = await request(endpoint, options, boundary);
    assertCurrentResponse(boundary);
    return response;
  }

  async function fetchApiJson<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const boundary = captureAuthBoundary();
    const response = await request(endpoint, options, boundary);
    assertCurrentResponse(boundary);
    const payload = await awaitApiOperation(() => response.json(), options.signal) as T;
    assertCurrentResponse(boundary);
    return payload;
  }

  return { fetchApi, fetchApiJson };
}
