import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';
import { PasswordRecovery, RECOVERY_LIFETIME_MS, recoveryRedirect, sendRecoveryEmail } from '../../app/auth/passwordRecovery.js';
import { takeRecoveryLink } from '../../app/auth/recoveryBootstrap.js';
import { captureAuthBoundary, setAuthenticatedUser } from '../../app/utils/authBoundary.js';

const config = { url: 'https://synthetic.invalid', key: 'synthetic-public-key', enabled: true };
const hash = 'synthetic-single-use-recovery-code';
const user = (id = 'A') => ({ id, aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-10-19T00:00:00Z' });
const token = (id = 'A', seconds = 3600) => [Buffer.from('{"alg":"HS256"}').toString('base64url'),
  Buffer.from(JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + seconds })).toString('base64url'), 'synthetic'].join('.');
const session = (id = 'A', seconds = 3600) => ({ user: user(id), access_token: token(id, seconds),
  refresh_token: 'synthetic-refresh-' + id, token_type: 'bearer', expires_in: seconds });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'X-Supabase-Api-Version': '2024-01-01' } });
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }

function fixture(options: { put?: (init: RequestInit) => Promise<Response>; verify?: () => Promise<Response>; logout?: () => Promise<Response>; now?: () => number } = {}) {
  setAuthenticatedUser(null);
  const requests: { url: URL; init: RequestInit }[] = [];
  let used = false;
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input)); requests.push({ url, init: init ?? {} });
    if (url.pathname === '/auth/v1/verify') {
      assert.equal(JSON.parse(String(init?.body)).type, 'recovery');
      assert.equal(JSON.parse(String(init?.body)).token_hash, hash);
      if (used) return json({ code: 'otp_expired', message: 'synthetic invalid' }, 403);
      used = true;
      return options.verify ? options.verify() : json(session());
    }
    if (url.pathname === '/auth/v1/user' && init?.method === 'PUT') return options.put ? options.put(init) : json({ user: user() });
    if (url.pathname === '/auth/v1/logout') return options.logout ? options.logout() : new Response(null, { status: 204 });
    throw new Error('Unexpected synthetic provider request');
  };
  return { requests, create: (value: string | null = hash) => new PasswordRecovery(value, config, fetcher, options.now), fetcher };
}

test('bootstrap accepts only the fixed reset fragment and erases credentials/history state before main auth', () => {
  const paths: string[] = [];
  assert.equal(takeRecoveryLink('https://app.invalid/reset-password#token_hash=' + hash, path => paths.push(path)), hash);
  assert.deepEqual(paths, ['/reset-password']);
  for (const suffix of ['', '?token_hash=' + hash, '#access_token=synthetic&refresh_token=synthetic&type=recovery',
    '#token_hash=' + hash + '&next=https://evil.invalid', '#token_hash=' + hash + '&token_hash=' + hash]) {
    assert.equal(takeRecoveryLink('https://app.invalid/reset-password' + suffix, () => {}), null);
  }
  let cleaned = false;
  assert.equal(takeRecoveryLink('https://app.invalid/#access_token=synthetic&type=recovery', () => { cleaned = true; }), null);
  assert.equal(cleaned, true);
  assert.equal(takeRecoveryLink('https://app.invalid/#access_token=synthetic&type=signup', () => { throw new Error('Unrelated callback'); }), null);
  const main = readFileSync('src/main.tsx', 'utf8');
  assert.ok(main.indexOf('recoveryBootstrap') < main.indexOf('App from'));
});

test('a new same-page email fragment restarts bootstrap while normal callbacks stay untouched', () => {
  let href = 'https://app.invalid/reset-password#token_hash=' + hash;
  let reloads = 0;
  let hashChanged: () => void = () => { throw new Error('Missing listener'); };
  const browser = { location: { get href() { return href; }, reload: () => { reloads++; } },
    history: { replaceState: (_state: null, _title: string, path: string) => { href = 'https://app.invalid' + path; } },
    addEventListener: (_event: string, listener: () => void) => { hashChanged = listener; } };
  const output = ts.transpileModule(readFileSync('src/app/auth/recoveryBootstrap.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: { consumeRecoveryLink?: () => string | null } = {};
  new Function('globalThis', 'exports', output)({ window: browser }, exports);
  assert.equal(href, 'https://app.invalid/reset-password');
  assert.equal(exports.consumeRecoveryLink!(), hash); assert.equal(exports.consumeRecoveryLink!(), null);
  href += '#token_hash=synthetic-another-recovery-code'; hashChanged(); assert.equal(reloads, 1);
  href = 'https://app.invalid/#access_token=synthetic&type=signup'; hashChanged(); assert.equal(reloads, 1);
});

test('email uses the exact allowed path, fixed origin and neutral outcomes even for provider/network errors', async () => {
  assert.equal(recoveryRedirect('https://app.invalid'), 'https://app.invalid/reset-password');
  assert.equal(recoveryRedirect('http://localhost:5173'), 'http://localhost:5173/reset-password');
  for (const bad of ['https://app.invalid/path', 'http://app.invalid', 'https://a@evil.invalid', '//evil.invalid']) assert.throws(() => recoveryRedirect(bad));
  let count = 0;
  for (const status of [200, 400, 429, 500]) await sendRecoveryEmail(config, 'synthetic@example.invalid', 'https://app.invalid', async (input, init) => {
    const url = new URL(String(input)); assert.equal(url.pathname, '/auth/v1/recover');
    assert.equal(url.searchParams.get('redirect_to'), 'https://app.invalid/reset-password');
    assert.equal(JSON.parse(String(init?.body)).email, 'synthetic@example.invalid'); count++;
    return json(status === 200 ? {} : { message: 'never expose provider detail' }, status);
  });
  assert.equal(count, 4);
  await sendRecoveryEmail(config, 'synthetic@example.invalid', 'https://app.invalid', async () => { throw new Error('synthetic private request detail'); });
  await assert.rejects(sendRecoveryEmail({ ...config, enabled: false }, 'synthetic@example.invalid', 'https://app.invalid', async () => { throw new Error('Must not send'); }));
});

test('genuine provider verification precedes a single password update; completion consumes authority without logging in', async () => {
  const f = fixture(), flow = f.create(), boundary = captureAuthBoundary();
  try {
    await flow.save('synthetic-new-password', 'synthetic-new-password'); assert.equal(f.requests.length, 0);
    await Promise.all([flow.verify(), flow.verify()]); assert.equal(flow.getSnapshot().phase, 'ready');
    await flow.save('short', 'short'); assert.equal(flow.getSnapshot().phase, 'ready'); assert.equal(f.requests.length, 1);
    await flow.save('synthetic-new-password', 'different'); assert.match(flow.getSnapshot().message, /一致/);
    await Promise.all([flow.save('synthetic-new-password', 'synthetic-new-password'), flow.save('another-password', 'another-password')]);
    assert.equal(flow.getSnapshot().phase, 'complete'); assert.equal(captureAuthBoundary(), boundary);
    assert.deepEqual(f.requests.map(x => x.url.pathname), ['/auth/v1/verify', '/auth/v1/user', '/auth/v1/logout']);
    assert.equal(new Headers(f.requests[1].init.headers).get('Authorization'), 'Bearer ' + token());
    assert.equal(f.requests[2].url.searchParams.get('scope'), 'global');
    await flow.save('synthetic-new-password', 'synthetic-new-password'); assert.equal(f.requests.length, 3);
    const replay = f.create(); try { await replay.verify(); assert.equal(replay.getSnapshot().phase, 'invalid'); } finally { replay.invalidate(); }
  } finally { flow.invalidate(); }
});

test('ordinary session, invalid/expired code and near-expiry session cannot authorize a password update', async () => {
  for (const verify of [async () => json({ code: 'otp_expired', message: 'synthetic expired' }, 403), async () => json(session('A', 1))]) {
    const f = fixture({ verify }), flow = f.create();
    try { await flow.verify(); await flow.save('synthetic-new-password', 'synthetic-new-password'); assert.equal(flow.getSnapshot().phase, 'invalid'); assert.equal(f.requests.length, 1); }
    finally { flow.invalidate(); }
  }
  const f = fixture(); setAuthenticatedUser('A'); const flow = f.create(null);
  try { await flow.verify(); await flow.save('synthetic-new-password', 'synthetic-new-password'); assert.equal(f.requests.length, 0); }
  finally { flow.invalidate(); }
});

for (const during of ['verify', 'response', 'body']) test('account switch during ' + during + ' cannot publish an old session or send a new request', async () => {
  const sent = deferred<void>(), response = deferred<Response>(), body = deferred<unknown>();
  const delayed = async () => {
    sent.resolve(); if (during !== 'body') return response.promise;
    const result = json({}); Object.defineProperty(result, 'json', { value: () => body.promise }); return result;
  };
  const f = fixture(during === 'verify' ? { verify: delayed } : { put: delayed }), flow = f.create();
  const main = createClient(config.url, config.key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async () => json(session('B')) } });
  try {
    if (during !== 'verify') await flow.verify();
    const pending = during === 'verify' ? flow.verify() : flow.save('synthetic-new-password', 'synthetic-new-password');
    await sent.promise;
    await main.auth.signInWithPassword({ email: 'B@example.invalid', password: 'synthetic-login' }); setAuthenticatedUser('B');
    if (during === 'body') body.resolve({ user: user() }); else response.resolve(json(during === 'verify' ? session() : { user: user() }));
    await pending;
    assert.equal(flow.getSnapshot().phase, 'invalid'); assert.equal(captureAuthBoundary().userId, 'B');
    assert.equal((await main.auth.getSession()).data.session?.user.id, 'B');
    assert.equal(f.requests.filter(x => x.url.pathname.endsWith('logout')).length, 0);
    await flow.save('another-password', 'another-password'); assert.equal(f.requests.length, during === 'verify' ? 1 : 2);
  } finally { flow.invalidate(); }
});

test('cancel, same-user re-login and memory expiry revoke a ready reset without a provider refresh', async () => {
  for (const cancel of [() => setAuthenticatedUser('A'), () => setAuthenticatedUser(null, { newSession: true })]) {
    const f = fixture(), flow = f.create();
    try { await flow.verify(); cancel(); await flow.save('synthetic-new-password', 'synthetic-new-password'); assert.equal(flow.getSnapshot().phase, 'invalid'); assert.equal(f.requests.length, 1); }
    finally { flow.invalidate(); }
  }
  let now = Date.now(); const f = fixture({ now: () => now }), flow = f.create();
  try { await flow.verify(); now += RECOVERY_LIFETIME_MS; await flow.save('synthetic-new-password', 'synthetic-new-password'); assert.equal(flow.getSnapshot().phase, 'invalid'); assert.equal(f.requests.length, 1); }
  finally { flow.invalidate(); }
});

test('safe password policy errors retain authority for correction; ambiguous errors consume it', async () => {
  for (const code of ['weak_password', 'same_password', 'unexpected_failure']) {
    const f = fixture({ put: async () => json({ code, message: 'never expose raw provider text' }, 422) }), flow = f.create();
    try {
      await flow.verify(); await flow.save('synthetic-new-password', 'synthetic-new-password');
      assert.equal(flow.getSnapshot().phase, code === 'unexpected_failure' ? 'invalid' : 'ready');
      assert.equal(flow.getSnapshot().message.includes('never expose'), false);
    } finally { flow.invalidate(); }
  }
});

test('saved password is reported separately from failed session revocation', async () => {
  const f = fixture({ logout: async () => json({ message: 'synthetic unavailable' }, 500) }), flow = f.create();
  try { await flow.verify(); await flow.save('synthetic-new-password', 'synthetic-new-password'); assert.equal(flow.getSnapshot().phase, 'complete'); assert.match(flow.getSnapshot().message, /確認できません/); }
  finally { flow.invalidate(); }
});

test('lifetime expiry during an already dispatched save retains the unknown-result login guidance', async () => {
  const sent = deferred<void>(), response = deferred<Response>();
  let now = Date.now();
  const f = fixture({ now: () => now, put: async () => { sent.resolve(); return response.promise; } }), flow = f.create();
  try {
    await flow.verify(); now += RECOVERY_LIFETIME_MS - 5000;
    const pending = flow.save('synthetic-new-password', 'synthetic-new-password'); await sent.promise;
    now += 6000; flow.invalidate(); // same callback as the lifetime timer
    assert.match(flow.getSnapshot().message, /保存結果を確認できません/);
    assert.match(flow.getSnapshot().message, /ログインを試し/);
    response.resolve(json({ user: user() })); await pending;
    assert.equal(flow.getSnapshot().phase, 'invalid'); assert.match(flow.getSnapshot().message, /保存結果を確認できません/);
    flow.invalidate(); assert.match(flow.getSnapshot().message, /保存結果を確認できません/);
    assert.equal(f.requests.filter(x => x.url.pathname.endsWith('logout')).length, 0);
  } finally { flow.invalidate(); }
});
