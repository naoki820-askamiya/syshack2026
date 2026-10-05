import assert from 'node:assert/strict';
import test from 'node:test';
import { GoTrueClient } from '@supabase/auth-js';
import { captureAuthBoundary, isCurrentAuthBoundary, setAuthenticatedUser } from '../../app/utils/authBoundary.js';

// Feasibility probe only. No route, singleton Auth options, SDK internals or real
// provider is changed. Fetch is injected and all users/tokens are synthetic.
let fixtureId = 0;
const authUrl = 'https://synthetic.invalid/auth/v1';
const user = (id: string) => ({ id, aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-10-05T00:00:00Z' });
const jwt = (id: string, seconds = 3600) => [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
  Buffer.from(JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + seconds })).toString('base64url'), 'synthetic-signature'].join('.');
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const session = (id: string) => ({ access_token: jwt(id), refresh_token: 'synthetic-refresh-' + id, token_type: 'bearer', expires_in: 3600, user: user(id) });

async function mainClient() {
  setAuthenticatedUser(null);
  const client = new GoTrueClient({ url: authUrl, storageKey: 'synthetic-main-' + ++fixtureId,
    persistSession: false, autoRefreshToken: false, detectSessionInUrl: false,
    fetch: async (_input, init) => json(session(JSON.parse(String(init?.body)).email === 'A@example.invalid' ? 'A' : 'B')) });
  await client.initialize();
  const observer = client.onAuthStateChange((_event, next) => setAuthenticatedUser(next?.user.id ?? null));
  await client.signInWithPassword({ email: 'A@example.invalid', password: 'synthetic-login' });
  return { client, close: () => observer.data.subscription.unsubscribe() };
}

function isolatedCandidate(token: string, boundary: ReturnType<typeof captureAuthBoundary>, transport: (init: RequestInit) => Promise<Response>) {
  const sent: { method: string }[] = []; let deniedRefresh = 0;
  const client = new GoTrueClient({ url: authUrl, storageKey: 'synthetic-isolated-' + ++fixtureId,
    persistSession: false, autoRefreshToken: false, detectSessionInUrl: false,
    fetch: async (input, init) => {
      const url = new URL(String(input));
      if (url.origin !== 'https://synthetic.invalid' || url.pathname !== '/auth/v1/user') {
        if (url.pathname.endsWith('/token')) deniedRefresh++;
        return json({ code: 'recovery_requires_fresh_session', message: 'Synthetic refresh denied' }, 400);
      }
      if (deniedRefresh > 0 || !isCurrentAuthBoundary(boundary) || new Headers(init?.headers).get('Authorization') !== 'Bearer ' + token) {
        return json({ code: 'stale_recovery', message: 'Synthetic stale recovery' }, 409);
      }
      if (init?.method !== 'GET' && init?.method !== 'PUT') return json({ message: 'Synthetic method denied' }, 400);
      sent.push({ method: init.method });
      return init.method === 'GET' ? json({ user: user('A') }) : await transport(init);
    } });
  return { client, sent, get deniedRefresh() { return deniedRefresh; },
    update: async () => {
      const loaded = await client.setSession({ access_token: token, refresh_token: 'synthetic-refresh-A' });
      if (loaded.error) return { kind: 'error', error: loaded.error };
      if (!isCurrentAuthBoundary(boundary)) return { kind: 'stale' };
      const result = await client.updateUser({ password: 'synthetic-new-password' });
      if (!isCurrentAuthBoundary(boundary)) return { kind: 'stale' };
      return result.error ? { kind: 'error', error: result.error } : { kind: 'success' };
    } };
}

test('private SDK fresh update preserves the main session and sends only the captured token', async () => {
  const main = await mainClient(); const boundary = captureAuthBoundary();
  const token = (await main.client.getSession()).data.session!.access_token;
  const candidate = isolatedCandidate(token, boundary, async init => {
    assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer ' + token); return json({ user: user('A') });
  });
  assert.equal((await candidate.update()).kind, 'success');
  assert.equal((await main.client.getSession()).data.session?.access_token, token);
  assert.equal(captureAuthBoundary(), boundary); assert.equal(candidate.deniedRefresh, 0);
  assert.deepEqual(candidate.sent, [{ method: 'GET' }, { method: 'PUT' }]); main.close();
});

test('private delayed update result is stale after same-user logout/relogin epoch', async () => {
  const main = await mainClient(); const boundary = captureAuthBoundary();
  const sent = deferred<void>(), response = deferred<Response>();
  const candidate = isolatedCandidate(jwt('A'), boundary, async () => { sent.resolve(); return response.promise; });
  const pending = candidate.update(); await sent.promise;
  setAuthenticatedUser(null);
  await main.client.signInWithPassword({ email: 'A@example.invalid', password: 'synthetic-login' });
  response.resolve(json({ user: user('A') }));
  assert.equal((await pending).kind, 'stale'); assert.equal(captureAuthBoundary().userId, 'A');
  assert.notEqual(captureAuthBoundary().epoch, boundary.epoch); main.close();
});

test('switch before private SDK session initialization sends no password update', async () => {
  const main = await mainClient(); const boundary = captureAuthBoundary();
  const candidate = isolatedCandidate(jwt('A'), boundary, async () => { throw new Error('Unexpected password dispatch'); });
  await main.client.signInWithPassword({ email: 'B@example.invalid', password: 'synthetic-login' });
  assert.equal((await candidate.update()).kind, 'error');
  assert.equal(candidate.sent.length, 0); assert.equal((await main.client.getSession()).data.session?.user.id, 'B'); main.close();
});

for (const duringBody of [false, true]) test('private delayed ' + (duringBody ? 'JSON body' : 'response') + ' cannot restore A over main B', async () => {
  const main = await mainClient(); const boundary = captureAuthBoundary();
  const sent = deferred<void>(), response = deferred<Response>(), body = deferred<unknown>();
  const candidate = isolatedCandidate(jwt('A'), boundary, async () => {
    sent.resolve(); if (!duringBody) return response.promise;
    const value = json({}); Object.defineProperty(value, 'json', { value: () => body.promise }); return value;
  });
  const pending = candidate.update(); await sent.promise;
  await main.client.signInWithPassword({ email: 'B@example.invalid', password: 'synthetic-login' });
  if (duringBody) body.resolve({ user: user('A') }); else response.resolve(json({ user: user('A') }));
  assert.equal((await pending).kind, 'stale');
  assert.equal((await main.client.getSession()).data.session?.user.id, 'B'); assert.equal(captureAuthBoundary().userId, 'B');
  // SDK may save A inside the private client; it has no main-session subscriber.
  assert.equal((await candidate.client.getSession()).data.session?.user.id, 'A'); main.close();
});

for (const seconds of [1, -1]) test('private ' + (seconds > 0 ? 'near-expiry' : 'expired') + ' session denies provider refresh without changing main', async () => {
  const main = await mainClient(); const boundary = captureAuthBoundary();
  const token = (await main.client.getSession()).data.session!.access_token;
  const candidate = isolatedCandidate(jwt('A', seconds), boundary, async () => { throw new Error('Unexpected password dispatch'); });
  assert.equal((await candidate.update()).kind, 'error');
  assert.equal(candidate.deniedRefresh, 1); assert.equal(candidate.sent.filter(x => x.method === 'PUT').length, 0);
  assert.equal((await main.client.getSession()).data.session?.access_token, token); assert.equal(captureAuthBoundary(), boundary); main.close();
});
