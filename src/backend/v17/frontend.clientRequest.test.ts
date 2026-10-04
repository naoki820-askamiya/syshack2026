import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createApiClient, StaleAuthResponseError } from '../../app/api/clientRequest.js';
import { captureAuthBoundary, finishExplicitLogin, setAuthenticatedUser } from '../../app/utils/authBoundary.js';
import { getAnalysis, getConsultations, saveAnalysis, saveConsultation } from '../../app/utils/storage.js';
import type { ConsultationData } from '../../app/types.js';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const session = async () => ({ data: { session: { access_token: 'synthetic-token' } } });
const loginA = () => setAuthenticatedUser('A', { newSession: true });
const caseData: ConsultationData = {
  id: 'A-case', personId: 'A-person', personName: '合成人物', relation: '同僚',
  event: 'synthetic A event', reaction: '分からない', userAction: '', timing: '直後',
  createdAt: '2026-10-04T00:00:00.000Z',
};

async function staleResponseCase(changeAuth: () => void) {
  loginA();
  const response = deferred<Response>();
  const started = deferred<void>();
  const client = createApiClient({ getSession: session, send: async () => { started.resolve(); return response.promise; } });
  let state: string | null = null;
  const pending = client.fetchApiJson<{ summary: string }>('/api/analysis-cases/A-case')
    .then((payload) => {
      // Deliberately use the current default cache boundary: the central client must not deliver A's old data.
      saveConsultation(caseData);
      saveAnalysis('A-case', payload);
      state = payload.summary;
    });
  await started.promise;
  changeAuth();
  response.resolve(Response.json({ summary: 'private A' }));
  await assert.rejects(pending, (error: unknown) => error instanceof StaleAuthResponseError && error.code === 'AUTH_RESPONSE_STALE');
  assert.equal(state, null);
  assert.deepEqual(getConsultations(), []);
  assert.equal(getAnalysis('A-case'), undefined);
}

test('A request cannot populate B cache or state after B logs in', () => staleResponseCase(() => setAuthenticatedUser('B')));
test('A request cannot populate cache or state after logout', () => staleResponseCase(() => setAuthenticatedUser(null)));
test('logout then same-user login rejects the previous session response', () => staleResponseCase(() => {
  setAuthenticatedUser(null); setAuthenticatedUser('A');
}));
test('session expiry then re-login rejects the previous epoch response', () => staleResponseCase(() => {
  setAuthenticatedUser(null); setAuthenticatedUser('A', { newSession: true });
}));
test('current explicit same-user login rejects prior requests without changing auth flow', () => {
  loginA();
  return staleResponseCase(() => finishExplicitLogin(captureAuthBoundary(), 'A'));
});

test('identity change during JSON parsing rejects payload before caller state/cache writes', async () => {
  loginA();
  const body = deferred<{ summary: string }>();
  const parsing = deferred<void>();
  const response = Response.json({});
  Object.defineProperty(response, 'json', { value: async () => { parsing.resolve(); return body.promise; } });
  const client = createApiClient({ getSession: session, send: async () => response });
  let state: string | null = null;
  const pending = client.fetchApiJson<{ summary: string }>('/api/persons').then((payload) => { state = payload.summary; saveAnalysis('A-case', payload); });
  await parsing.promise;
  setAuthenticatedUser('B');
  body.resolve({ summary: 'private A' });
  await assert.rejects(pending, StaleAuthResponseError);
  assert.equal(state, null);
  assert.equal(getAnalysis('A-case'), undefined);
});

test('JSON parsing after logout and same-user login remains tied to its original epoch', async () => {
  loginA();
  const body = deferred<unknown>();
  const parsing = deferred<void>();
  const response = Response.json({});
  Object.defineProperty(response, 'json', { value: async () => { parsing.resolve(); return body.promise; } });
  const client = createApiClient({ getSession: session, send: async () => response });
  const pending = client.fetchApiJson('/api/persons');
  await parsing.promise;
  setAuthenticatedUser(null); setAuthenticatedUser('A');
  body.resolve({ private: 'old A' });
  await assert.rejects(pending, StaleAuthResponseError);
});

test('same-user parallel requests all complete even after auth reconfirmation', async () => {
  loginA();
  const responses = Array.from({ length: 3 }, () => deferred<Response>());
  const allSent = deferred<void>();
  let sends = 0;
  const client = createApiClient({ getSession: session, send: async (endpoint) => {
    sends += 1;
    if (sends === 3) allSent.resolve();
    return responses[Number(endpoint.at(-1))]!.promise;
  } });
  const pending = [0, 1, 2].map((i) => client.fetchApiJson<{ id: number }>(`/api/persons/${i}`));
  await allSent.promise;
  const epoch = captureAuthBoundary().epoch;
  setAuthenticatedUser('A'); // TOKEN_REFRESHED / repeated SIGNED_IN uses the existing unchanged boundary.
  assert.equal(captureAuthBoundary().epoch, epoch);
  [2, 0, 1].forEach((i) => responses[i]!.resolve(Response.json({ id: i })));
  assert.deepEqual(await Promise.all(pending), [{ id: 0 }, { id: 1 }, { id: 2 }]);
  assert.equal(sends, 3);
});

test('unchanged auth preserves token headers request options and JSON payload behavior', async () => {
  loginA();
  let sessions = 0;
  const controller = new AbortController();
  const response = Response.json({ id: 'same-user' }, { status: 201 });
  const client = createApiClient({ getSession: async () => { sessions += 1; return session(); }, send: async (endpoint, options) => {
    assert.equal(endpoint, '/api/persons');
    assert.equal(options.method, 'POST');
    assert.equal(options.body, '{"name":"synthetic"}');
    assert.equal(options.signal, controller.signal);
    assert.equal(options.credentials, 'include');
    const headers = new Headers(options.headers);
    assert.equal(headers.get('Authorization'), 'Bearer synthetic-token');
    assert.equal(headers.get('Content-Type'), 'application/custom+json');
    assert.equal(headers.get('x-test'), 'preserved');
    return response;
  } });
  const headers = new Headers({ Authorization: 'caller-token', 'Content-Type': 'application/custom+json', 'x-test': 'preserved' });
  assert.deepEqual(await client.fetchApiJson('/api/persons', {
    method: 'POST', body: '{"name":"synthetic"}', signal: controller.signal, credentials: 'include', headers,
  }), { id: 'same-user' });
  assert.equal(sessions, 1);
  assert.equal(headers.get('Authorization'), 'caller-token'); // Original headers are not mutated.
});

test('raw protected response identity and FormData Content-Type behavior stay unchanged', async () => {
  loginA();
  const response = new Response(null, { status: 204 });
  const form = new FormData(); form.set('synthetic', 'value');
  const client = createApiClient({ getSession: session, send: async (_endpoint, options) => {
    assert.equal(options.body, form);
    assert.equal(new Headers(options.headers).has('Content-Type'), false);
    return response;
  } });
  assert.equal(await client.fetchApi('/api/persons', { method: 'POST', body: form }), response);
  assert.equal(response.bodyUsed, false);
});

test('raw successful response is rejected after its originating user changes', async () => {
  loginA();
  const response = deferred<Response>();
  const started = deferred<void>();
  const client = createApiClient({ getSession: session, send: async () => { started.resolve(); return response.promise; } });
  const pending = client.fetchApi('/api/persons');
  await started.promise;
  setAuthenticatedUser('B');
  response.resolve(Response.json({ private: 'A' }));
  await assert.rejects(pending, StaleAuthResponseError);
});

for (const status of [401, 403, 409]) {
  test(`HTTP ${status} reaches caller even when auth changes while its error body is parsed`, async () => {
    loginA();
    const body = deferred<unknown>();
    const parsing = deferred<void>();
    const response = new Response(null, { status });
    Object.defineProperty(response, 'json', { value: async () => { parsing.resolve(); return body.promise; } });
    const client = createApiClient({ getSession: session, send: async () => response });
    const pending = client.fetchApiJson('/api/persons');
    await parsing.promise;
    setAuthenticatedUser('B');
    body.resolve({ error: { message: `original ${status}`, requestId: 'synthetic-request-id' } });
    await assert.rejects(pending, (error: unknown) => error instanceof Error && !(error instanceof StaleAuthResponseError)
      && error.message === `original ${status}（問い合わせID: synthetic-request-id）`);
  });
}

test('HTTP fallback error formatting is preserved when JSON is invalid', async () => {
  loginA();
  const client = createApiClient({ getSession: session, send: async () => new Response('not-json', { status: 403 }) });
  await assert.rejects(client.fetchApi('/api/persons'), (error: unknown) => error instanceof Error && error.message === 'APIエラー: 403');
});

for (const [kind, error] of [
  ['abort', new DOMException('caller aborted', 'AbortError')],
  ['network', new TypeError('Failed to fetch')],
] as const) {
  test(`${kind} failure is preserved as the original error rather than replaced with stale-response`, async () => {
    loginA();
    const result = deferred<Response>();
    const started = deferred<void>();
    const client = createApiClient({ getSession: session, send: async () => { started.resolve(); return result.promise; } });
    const pending = client.fetchApiJson('/api/persons');
    await started.promise;
    setAuthenticatedUser('B');
    result.reject(error);
    await assert.rejects(pending, (actual: unknown) => actual === error && !(actual instanceof StaleAuthResponseError));
  });
}

test('body parse failure keeps its original error even after auth changes', async () => {
  loginA();
  const body = deferred<unknown>();
  const parsing = deferred<void>();
  const error = new SyntaxError('original invalid JSON');
  const response = Response.json({});
  Object.defineProperty(response, 'json', { value: async () => { parsing.resolve(); return body.promise; } });
  const client = createApiClient({ getSession: session, send: async () => response });
  const pending = client.fetchApiJson('/api/persons');
  await parsing.promise;
  setAuthenticatedUser('B'); body.reject(error);
  await assert.rejects(pending, (actual: unknown) => actual === error);
});

test('missing token and session lookup failure keep existing behavior without sending', async () => {
  loginA();
  let sends = 0;
  const send = async () => { sends += 1; return Response.json({}); };
  const missing = createApiClient({ getSession: async () => ({ data: { session: null } }), send });
  await assert.rejects(missing.fetchApi('/api/persons'), (error: unknown) => error instanceof Error && error.message === 'ログインが必要です。');
  const error = new Error('original session lookup failure');
  const failed = createApiClient({ getSession: async () => { throw error; }, send });
  await assert.rejects(failed.fetchApiJson('/api/persons'), (actual: unknown) => actual === error);
  assert.equal(sends, 0);
});

test('production protected client uses this transport while public/login/register paths bypass it', () => {
  const source = (path: string) => readFileSync(path, 'utf8');
  const binding = source('src/app/api/client.ts');
  assert.match(binding, /import \{ createApiClient \} from '\.\/clientRequest'/);
  assert.match(binding, /getSession: \(\) => supabase\.auth\.getSession\(\)/);
  assert.match(binding, /export const fetchApiJson = client\.fetchApiJson/);
  for (const path of ['src/app/auth/AuthContext.tsx', 'src/app/auth/supabase.ts', 'src/app/pages/Login.tsx', 'src/app/pages/Register.tsx', 'src/backend/server.ts']) {
    assert.doesNotMatch(source(path), /(?:api\/client|clientRequest|StaleAuthResponseError)/, path);
  }
  const auth = source('src/app/auth/AuthContext.tsx');
  assert.match(auth, /supabase\.auth\.signInWithPassword\(/);
  assert.match(auth, /supabase\.auth\.signUp\(/);
  const settings = source('src/app/auth/supabase.ts');
  assert.match(settings, /persistSession: false/);
  assert.match(settings, /autoRefreshToken: false/);
  assert.match(settings, /detectSessionInUrl: true/);
  assert.match(source('src/backend/server.ts'), /app\.get\("\/health"/);
});
