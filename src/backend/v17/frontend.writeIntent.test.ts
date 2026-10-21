import assert from 'node:assert/strict';
import test from 'node:test';
import { createApiClient, StaleAuthResponseError } from '../../app/api/clientRequest.js';
import { setAuthenticatedUser } from '../../app/utils/authBoundary.js';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};
const session = () => ({ data: { session: { access_token: 'synthetic-current-token' } } });
const login = () => setAuthenticatedUser('A', { newSession: true });
const transitions = {
  switch: () => setAuthenticatedUser('B'),
  logout: () => setAuthenticatedUser(null),
  relogin: () => { setAuthenticatedUser(null); setAuthenticatedUser('A'); },
};

for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
  for (const [name, transition] of Object.entries(transitions)) {
    test(`${method}: ${name} during getSession prevents old write intent from being sent`, async () => {
      login();
      const token = deferred<ReturnType<typeof session>>();
      let sends = 0;
      const client = createApiClient({ getSession: () => token.promise, send: async () => {
        sends += 1;
        return Response.json({ saved: true });
      } });
      const pending = client.fetchApiJson('/api/persons', { method, body: '{"notes":"synthetic A input"}' });
      transition();
      token.resolve(session());
      let failure: unknown;
      try { await pending; } catch (error) { failure = error; }
      assert.equal(sends, 0, 'old A body must never be transmitted with a new session token');
      assert.equal((failure as { code?: string })?.code, 'AUTH_WRITE_INTENT_STALE');
    });
  }
}

test('same-user parallel writes are not serialized and each sends exactly once', async () => {
  login();
  const tokens = Array.from({ length: 4 }, () => deferred<ReturnType<typeof session>>());
  let lookups = 0;
  let sends = 0;
  const client = createApiClient({ getSession: () => tokens[lookups++]!.promise, send: async (_endpoint, options) => {
    sends += 1;
    assert.equal(new Headers(options.headers).get('Authorization'), 'Bearer synthetic-current-token');
    return Response.json({ body: options.body });
  } });
  const methods = ['POST', 'PATCH', 'PUT', 'DELETE'];
  const pending = methods.map((method) => client.fetchApiJson('/api/persons', { method, body: method }));
  assert.equal(lookups, 4);
  setAuthenticatedUser('A');
  tokens.forEach((token) => token.resolve(session()));
  assert.deepEqual(await Promise.all(pending), methods.map((body) => ({ body })));
  assert.equal(sends, 4);
});

test('raw helper and lowercase write method also reject before send', async () => {
  login();
  const token = deferred<ReturnType<typeof session>>();
  let sends = 0;
  const client = createApiClient({ getSession: () => token.promise, send: async () => { sends += 1; return Response.json({}); } });
  const pending = client.fetchApi('/api/persons', { method: 'post' });
  setAuthenticatedUser('B'); token.resolve(session());
  await assert.rejects(pending, (error: unknown) => (error as { code?: string }).code === 'AUTH_WRITE_INTENT_STALE');
  assert.equal(sends, 0);
});

test('missing token remains the original login error even when write intent is stale', async () => {
  login();
  const token = deferred<{ data: { session: null } }>();
  let sends = 0;
  const client = createApiClient({ getSession: () => token.promise, send: async () => { sends += 1; return Response.json({}); } });
  const pending = client.fetchApi('/api/persons', { method: 'POST' });
  setAuthenticatedUser(null); token.resolve({ data: { session: null } });
  await assert.rejects(pending, { message: 'ログインが必要です。' });
  assert.equal(sends, 0);
});

test('already aborted write preserves the exact abort reason before stale-intent classification', async () => {
  login();
  const token = deferred<ReturnType<typeof session>>();
  const controller = new AbortController();
  const reason = new DOMException('synthetic caller abort', 'AbortError');
  let sends = 0;
  const client = createApiClient({ getSession: () => token.promise, send: async () => { sends += 1; return Response.json({}); } });
  const pending = client.fetchApi('/api/persons', { method: 'DELETE', signal: controller.signal });
  controller.abort(reason); setAuthenticatedUser('B'); token.resolve(session());
  await assert.rejects(pending, (error: unknown) => error === reason);
  assert.equal(sends, 0);
});

for (const status of [401, 403, 409]) {
  test(`sent write preserves HTTP ${status} even after a later auth change`, async () => {
    login();
    const response = deferred<Response>();
    const sent = deferred<void>();
    const client = createApiClient({ getSession: async () => session(), send: async () => { sent.resolve(); return response.promise; } });
    const pending = client.fetchApi('/api/persons', { method: 'PATCH' });
    await sent.promise; setAuthenticatedUser('B');
    response.resolve(Response.json({ error: { message: `original ${status}` } }, { status }));
    await assert.rejects(pending, { message: `original ${status}` });
  });
}

test('sent write preserves network error identity', async () => {
  login();
  const error = new TypeError('synthetic failed fetch');
  const client = createApiClient({ getSession: async () => session(), send: async () => { setAuthenticatedUser('B'); throw error; } });
  await assert.rejects(client.fetchApi('/api/persons', { method: 'PUT' }), (actual: unknown) => actual === error);
});

test('GET retains its send behavior and existing stale response isolation', async () => {
  login();
  const token = deferred<ReturnType<typeof session>>();
  let sends = 0;
  const client = createApiClient({ getSession: () => token.promise, send: async () => { sends += 1; return Response.json({}); } });
  const pending = client.fetchApiJson('/api/persons');
  setAuthenticatedUser('B'); token.resolve(session());
  await assert.rejects(pending, StaleAuthResponseError);
  assert.equal(sends, 1);
});
