import assert from 'node:assert/strict';
import test from 'node:test';
import { GoTrueClient } from '@supabase/auth-js';
import { captureAuthBoundary, isCurrentAuthBoundary, setAuthenticatedUser } from '../../app/utils/authBoundary.js';

// Characterization only: the injected transport never contacts an Auth provider.
// The deferred initializer exposes the SDK's actual updateUser await before session selection.
let fixtureId = 0;
const user = (id: string) => ({ id, aud: 'authenticated', email: id + '@example.invalid',
  app_metadata: {}, user_metadata: {}, created_at: '2026-10-05T00:00:00Z' });
const session = (id: string) => ({ access_token: 'synthetic-access-' + id,
  refresh_token: 'synthetic-refresh-' + id, token_type: 'bearer', expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600, user: user(id) });
const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

async function fixture(update: (init: RequestInit) => Promise<Response>) {
  setAuthenticatedUser(null);
  const requests: RequestInit[] = [];
  const client = new GoTrueClient({ url: 'https://synthetic.invalid/auth/v1', storageKey: 'synthetic-password-' + ++fixtureId,
    persistSession: false, autoRefreshToken: false, detectSessionInUrl: false,
    fetch: async (input, init) => {
      const url = String(input);
      if (url.includes('/token?grant_type=password')) {
        const id = JSON.parse(String(init?.body)).email === 'A@example.invalid' ? 'A' : 'B';
        return json(session(id));
      }
      if (url.endsWith('/user') && init?.method === 'PUT') { requests.push(init); return await update(init); }
      throw new Error('Unexpected synthetic SDK request');
    },
  });
  await client.initialize();
  const observer = client.onAuthStateChange((_event, next) => { setAuthenticatedUser(next?.user.id ?? null); });
  await client.signInWithPassword({ email: 'A@example.invalid', password: 'synthetic-login' });
  return { client, requests, close: () => observer.data.subscription.unsubscribe() };
}

test('SDK characterization: a prechecked recovery A update can select B session after SDK initialization await', async () => {
  const flow = await fixture(async () => json({ user: user('B') }));
  const recovery = captureAuthBoundary(); assert.equal(recovery.userId, 'A'); assert.ok(isCurrentAuthBoundary(recovery));
  const initializer = deferred<{ error: null }>();
  // Test-only control of the existing protected initialization promise, never a production hook.
  (flow.client as unknown as { initializePromise: Promise<{ error: null }> }).initializePromise = initializer.promise;
  const updating = flow.client.updateUser({ password: 'synthetic-recovery-A-password' });
  await flow.client.signInWithPassword({ email: 'B@example.invalid', password: 'synthetic-login' });
  assert.equal(captureAuthBoundary().userId, 'B'); assert.equal(flow.requests.length, 0);
  initializer.resolve({ error: null });
  const result = await updating; assert.equal(result.error, null);
  assert.equal(flow.requests.length, 1);
  assert.equal(new Headers(flow.requests[0].headers).get('Authorization'), 'Bearer synthetic-access-B');
  assert.equal(JSON.parse(String(flow.requests[0].body)).password, 'synthetic-recovery-A-password');
  assert.equal(isCurrentAuthBoundary(recovery), false);
  flow.close();
});

test('SDK characterization: delayed recovery A success republishes A after B signs in', async () => {
  const response = deferred<Response>(), sent = deferred<void>();
  const flow = await fixture(async () => { sent.resolve(); return await response.promise; });
  const recovery = captureAuthBoundary(); assert.equal(recovery.userId, 'A');
  const updating = flow.client.updateUser({ password: 'synthetic-recovery-A-password' });
  await sent.promise;
  assert.equal(new Headers(flow.requests[0].headers).get('Authorization'), 'Bearer synthetic-access-A');
  await flow.client.signInWithPassword({ email: 'B@example.invalid', password: 'synthetic-login' });
  assert.equal(captureAuthBoundary().userId, 'B');
  response.resolve(json({ user: user('A') })); await updating;
  assert.equal((await flow.client.getSession()).data.session?.user.id, 'A');
  assert.equal(captureAuthBoundary().userId, 'A', 'SDK USER_UPDATED publishes the captured old session before caller continuation');
  assert.equal(isCurrentAuthBoundary(recovery), false);
  flow.close();
});
