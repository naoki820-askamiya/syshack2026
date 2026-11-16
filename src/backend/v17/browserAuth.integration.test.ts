import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import type { AddressInfo } from 'node:net';
import { AuthApiError, type Session } from '@supabase/supabase-js';
import { browserAuthProvider } from '../auth/provider.js';
import { supabaseAuth } from '../auth/supabase.js';
import { cookieName, readCookieSession, sealCookie } from '../auth/cookies.js';
import { authRateLimit } from '../auth/browserSecurity.js';

// Synthetic provider only; no database query or real Auth request is needed.
const origin = 'http://localhost:5173';
const safeEnv = { NODE_ENV: 'test', AUTH_COOKIE_SECRET: 'a1'.repeat(32), AUTH_COOKIE_SECURE: 'false',
  ALLOWED_ORIGINS: origin, DATABASE_URL: 'postgresql://synthetic:synthetic@127.0.0.1:1/offline' };
Object.assign(process.env, safeEnv);
const { createServerApp } = await import('../server.js');
Object.assign(process.env, safeEnv);
const { prisma } = await import('../prisma/client.js');
let base: string;
let server: ReturnType<Awaited<ReturnType<typeof createServerApp>>['listen']>;
before(async () => {
  server = (await createServerApp()).listen(0, '127.0.0.1');
  await new Promise<void>(done => server.once('listening', done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); await prisma.$disconnect(); });

function providerSession(id = 'A', expiresAt = Math.floor(Date.now() / 1000) + 3600): Session {
  return { access_token: 'synthetic-access-' + id, refresh_token: 'synthetic-refresh-' + id,
    expires_at: expiresAt, expires_in: 3600, token_type: 'bearer',
    user: { id, email: id + '@example.invalid', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2026-11-16T00:00:00Z' } };
}
function stub(t: test.TestContext) {
  const signIn = t.mock.method(browserAuthProvider, 'signIn', async (email: string) => ({ data: { session: providerSession(email.startsWith('B') ? 'B' : 'A'), user: null }, error: null }) as never);
  const getUser = t.mock.method(supabaseAuth.auth, 'getUser', async (token: string) => ({ data: { user: providerSession(token.endsWith('B') ? 'B' : 'A').user }, error: null }));
  const refresh = t.mock.method(browserAuthProvider, 'refresh', async () => ({ data: { session: providerSession(), user: null }, error: null }) as never);
  const signOut = t.mock.method(browserAuthProvider, 'signOut', async () => ({ data: null, error: null }));
  return { signIn, getUser, refresh, signOut };
}
function jar() {
  const cookies = new Map<string, string>();
  return { cookies, header: () => [...cookies].map(([key, value]) => key + '=' + value).join('; '),
    apply(response: Response) { for (const value of response.headers.getSetCookie()) {
      const first = value.split(';')[0]; const index = first.indexOf('='); const name = first.slice(0, index);
      if (/Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(value)) cookies.delete(name);
      else cookies.set(name, first.slice(index + 1));
    } } };
}
async function request(path: string, options: { jar?: ReturnType<typeof jar>; body?: unknown; headers?: Record<string, string>; method?: string } = {}) {
  const response = await fetch(base + path, { method: options.method ?? 'POST',
    headers: { origin, 'x-kigen-csrf': '1', 'content-type': 'application/json',
      ...(options.jar ? { cookie: options.jar.header() } : {}), ...options.headers },
    body: options.method === 'GET' ? undefined : JSON.stringify(options.body ?? {}),
  });
  options.jar?.apply(response);
  const body = await response.json() as Record<string, any>;
  return { response, body };
}
async function login(t: test.TestContext, identity = 'A') {
  const mocks = stub(t); const cookies = jar();
  const result = await request('/api/auth/login', { jar: cookies, body: { email: identity + '@example.invalid', password: 'synthetic-password' } });
  assert.equal(result.response.status, 200);
  return { cookies, id: result.body.session.id as string, result, mocks };
}
function expire(cookies: ReturnType<typeof jar>) {
  const current = readCookieSession(cookies.header())!;
  const value = { ...current, expiresAt: Math.floor(Date.now() / 1000) - 1 };
  cookies.cookies.set(cookieName('auth_' + current.id), sealCookie(value, current.id));
  return value;
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

test('HttpOnly login restores after reload, authenticates /me and persists logout without exposing tokens', async t => {
  const flow = await login(t);
  assert.deepEqual(Object.keys(flow.result.body.session).sort(), ['expiresAt', 'id', 'user']);
  assert.doesNotMatch(JSON.stringify(flow.result.body), /synthetic-access|synthetic-refresh|access_token|refresh_token/);
  for (const value of flow.result.response.headers.getSetCookie().filter(value => !value.includes('Expires=Thu, 01 Jan 1970'))) {
    assert.match(value, /HttpOnly/); assert.match(value, /SameSite=Lax/); assert.match(value, /Path=\//);
  }
  assert.doesNotMatch(flow.cookies.header(), /synthetic-access|synthetic-refresh/);
  assert.equal(flow.result.response.headers.get('cache-control'), 'no-store');
  const restored = await request('/api/auth/session', { jar: flow.cookies });
  assert.equal(restored.body.session.user.id, 'A');
  const me = await request('/api/me', { jar: flow.cookies, method: 'GET', headers: { 'x-kigen-session': flow.id } });
  assert.equal(me.body.user.id, 'A');
  const logout = await request('/api/auth/logout', { jar: flow.cookies, headers: { 'x-kigen-session': flow.id } });
  assert.equal(logout.response.status, 200); assert.equal(flow.mocks.signOut.mock.callCount(), 1);
  assert.equal((await request('/api/auth/session', { jar: flow.cookies })).body.session, null);
});

test('CSRF and simple cross-site login attempts are rejected before the provider sees credentials', async t => {
  const mocks = stub(t);
  for (const headers of [ { origin: 'https://evil.invalid' }, { origin: '' }, { 'x-kigen-csrf': '' },
    { 'sec-fetch-site': 'cross-site' }, { 'content-type': 'text/plain' } ] as Record<string, string>[]) {
    const result = await request('/api/auth/login', { headers, body: { email: 'A@example.invalid', password: 'synthetic' } });
    assert.ok([403, 415, 500].includes(result.response.status));
  }
  assert.equal(mocks.signIn.mock.callCount(), 0);
});

test('tampered, duplicate and unpaired credential cookies cannot restore login', async t => {
  const flow = await login(t);
  const key = cookieName('auth_' + flow.id); const value = flow.cookies.cookies.get(key)!;
  const original = readCookieSession(flow.cookies.header())!;
  flow.cookies.cookies.set(key, value.slice(0, -5) + 'aaaaa');
  assert.equal((await request('/api/auth/session', { jar: flow.cookies })).body.session, null);
  flow.cookies.cookies.set(key, sealCookie({ ...original, userId: 'B' }, flow.id));
  assert.equal((await request('/api/auth/session', { jar: flow.cookies })).body.session, null, 'provider identity must match the sealed owner');
  const duplicate = `${cookieName('session')}=${flow.id}; ${cookieName('session')}=${'b'.repeat(32)}; ${key}=${value}`;
  assert.equal((await request('/api/auth/session', { headers: { cookie: duplicate } })).body.session, null);
  const unpaired = `${cookieName('session')}=${'b'.repeat(32)}; ${key}=${value}`;
  assert.equal((await request('/api/auth/session', { headers: { cookie: unpaired } })).body.session, null);
});

test('cookie API rejects missing/stale binding, CSRF and mixed Bearer credentials before business logic', async t => {
  const flow = await login(t); const before = flow.mocks.getUser.mock.callCount();
  for (const headers of [{}, { 'x-kigen-session': 'b'.repeat(32) }, { authorization: 'Bearer synthetic' }] as Record<string, string>[]) {
    const result = await request('/api/me', { jar: flow.cookies, method: 'GET', headers });
    assert.ok([400, 409].includes(result.response.status));
  }
  const csrf = await request('/api/persons', { jar: flow.cookies, headers: { 'x-kigen-session': flow.id, 'x-kigen-csrf': '' } });
  assert.equal(csrf.response.status, 403);
  assert.equal(flow.mocks.getUser.mock.callCount(), before);
});

test('parallel reloads refresh once, retain binding, and never rewrite the active pointer', async t => {
  const flow = await login(t); expire(flow.cookies);
  const pending = deferred<any>(); const started = deferred<void>();
  flow.mocks.refresh.mock.mockImplementation(async () => { started.resolve(); return pending.promise; });
  const header = flow.cookies.header();
  const reads = [request('/api/auth/session', { headers: { cookie: header } }), request('/api/auth/session', { headers: { cookie: header } })];
  await started.promise;
  pending.resolve({ data: { session: providerSession(), user: null }, error: null });
  const results = await Promise.all(reads);
  assert.equal(flow.mocks.refresh.mock.callCount(), 1);
  for (const result of results) {
    assert.equal(result.body.session.id, flow.id);
    assert.equal(result.response.headers.getSetCookie().some(value => value.startsWith(cookieName('session') + '=')), false);
  }
});

for (const action of ['logout', 'switch']) test('late old refresh cannot restore or overwrite login after ' + action, async t => {
  const flow = await login(t); const stale = jar();
  for (const [key, value] of flow.cookies.cookies) stale.cookies.set(key, value);
  expire(stale);
  const pending = deferred<any>(); const started = deferred<void>();
  flow.mocks.refresh.mock.mockImplementation(async () => { started.resolve(); return pending.promise; });
  const read = request('/api/auth/session', { jar: stale });
  await started.promise;
  if (action === 'logout') await request('/api/auth/logout', { jar: flow.cookies, headers: { 'x-kigen-session': flow.id } });
  else await request('/api/auth/login', { jar: flow.cookies, body: { email: 'B@example.invalid', password: 'synthetic' } });
  pending.resolve({ data: { session: providerSession(), user: null }, error: null });
  const oldResponse = await read;
  flow.cookies.apply(oldResponse.response);
  const restored = await request('/api/auth/session', { jar: flow.cookies });
  assert.equal(restored.body.session?.user.id ?? null, action === 'logout' ? null : 'B');
});

test('invalid refresh ends login; provider infrastructure errors stay generic 500 with no cookie destruction', async t => {
  const flow = await login(t); expire(flow.cookies);
  flow.mocks.refresh.mock.mockImplementation(async () => ({ data: { session: null, user: null }, error: new AuthApiError('private refresh detail', 503, 'PRIVATE_CODE') }) as never);
  const unavailable = await request('/api/auth/session', { jar: flow.cookies });
  assert.equal(unavailable.response.status, 500);
  assert.doesNotMatch(JSON.stringify(unavailable.body), /private refresh detail|PRIVATE_CODE/);
  assert.ok(readCookieSession(flow.cookies.header()));
  flow.mocks.refresh.mock.mockImplementation(async () => ({ data: { session: null, user: null }, error: new AuthApiError('expired', 400, 'refresh_token_not_found') }) as never);
  const expired = await request('/api/auth/session', { jar: flow.cookies });
  assert.equal(expired.response.status, 200); assert.equal(expired.body.session, null);
});

test('failed logout retains the existing cookie and hides the provider error', async t => {
  const flow = await login(t); const before = flow.cookies.header();
  flow.mocks.signOut.mock.mockImplementation(async () => ({ data: null, error: new AuthApiError('private logout', 503, 'PRIVATE_CODE') }));
  const result = await request('/api/auth/logout', { jar: flow.cookies, headers: { 'x-kigen-session': flow.id } });
  assert.equal(result.response.status, 500); assert.equal(flow.cookies.header(), before);
  assert.doesNotMatch(JSON.stringify(result.body), /private logout|PRIVATE_CODE/);
});

test('registration keeps PKCE verifier HttpOnly and only exchanges a same-browser origin-bound code', async t => {
  stub(t); const cookies = jar();
  const signUp = t.mock.method(browserAuthProvider, 'signUp', async (_email: string, _password: string, _display: string | undefined, redirect: string) => {
    assert.equal(redirect, origin); return { data: { session: null, user: null }, error: null, verifier: 'v'.repeat(64) } as never;
  });
  const exchange = t.mock.method(browserAuthProvider, 'exchange', async (code: string, verifier: string) => {
    assert.equal(code, 'synthetic-code'); assert.equal(verifier, 'v'.repeat(64));
    return { data: { session: providerSession(), user: providerSession().user }, error: null } as never;
  });
  const register = await request('/api/auth/register', { jar: cookies, body: { email: 'A@example.invalid', password: 'synthetic', displayName: 'Nickname' } });
  assert.equal(register.body.session, null); assert.equal(signUp.mock.callCount(), 1);
  assert.doesNotMatch(cookies.header(), /vvvvvvvv/);
  const absent = await request('/api/auth/callback', { body: { code: 'synthetic-code' } });
  assert.equal(absent.response.status, 400); assert.equal(exchange.mock.callCount(), 0);
  const callback = await request('/api/auth/callback', { jar: cookies, body: { code: 'synthetic-code' } });
  assert.equal(callback.body.session.user.id, 'A'); assert.equal(cookies.cookies.has(cookieName('pkce')), false);
  const replay = await request('/api/auth/callback', { jar: cookies, body: { code: 'synthetic-code' } });
  assert.equal(replay.response.status, 400); assert.equal(exchange.mock.callCount(), 1);
});

test('secure defaults use host-only Secure cookies; missing keys fail before a login request', async t => {
  const flow = await login(t);
  process.env.AUTH_COOKIE_SECURE = 'true';
  t.after(() => { process.env.AUTH_COOKIE_SECURE = 'false'; process.env.AUTH_COOKIE_SECRET = 'a1'.repeat(32); });
  const secure = await request('/api/auth/login', { body: { email: 'A@example.invalid', password: 'synthetic' } });
  assert.equal(secure.response.status, 200);
  assert.ok(secure.response.headers.getSetCookie().some(value => value.startsWith('__Host-kigen_session=') && value.includes('Secure') && value.includes('HttpOnly')));
  const calls = flow.mocks.signIn.mock.callCount(); delete process.env.AUTH_COOKIE_SECRET;
  assert.equal((await request('/api/auth/login', { body: { email: 'A@example.invalid', password: 'synthetic' } })).response.status, 500);
  assert.equal(flow.mocks.signIn.mock.callCount(), calls);
});

test('credential proxy rate limit is bounded and becomes available after its window', () => {
  let now = 0; const middleware = authRateLimit(() => now); const errors: any[] = []; const headers: string[] = [];
  const req = { ip: 'synthetic', path: '/login' } as any;
  const res = { setHeader: (name: string) => headers.push(name) } as any;
  for (let i = 0; i < 21; i++) middleware(req, res, error => { if (error) errors.push(error); });
  assert.equal(errors.length, 1); assert.equal(errors[0].status, 429); assert.deepEqual(headers, ['Retry-After']);
  now += 10 * 60_000;
  middleware(req, res, error => assert.equal(error, undefined));
});
