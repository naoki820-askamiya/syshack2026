import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { browserAuthProvider } from '../auth/provider.js';

test('real SDK uses isolated PKCE storage, exchanges the matching verifier, refreshes and revokes only the supplied session', async t => {
  const previous = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_PUBLISHABLE_KEY };
  process.env.SUPABASE_URL = 'https://synthetic.invalid'; process.env.SUPABASE_PUBLISHABLE_KEY = 'synthetic-key';
  t.after(() => {
    if (previous.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previous.url;
    if (previous.key === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY; else process.env.SUPABASE_PUBLISHABLE_KEY = previous.key;
  });
  const user = { id: 'A', email: 'A@example.invalid', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2026-11-16T00:00:00Z' };
  const session = { access_token: 'synthetic-access-A', refresh_token: 'synthetic-refresh-A', token_type: 'bearer', expires_in: 3600, user };
  let challenge: string | undefined; let expectedVerifier: string | null = null; let exchanges = 0; let refreshes = 0; let revocations = 0;
  t.mock.method(globalThis, 'fetch', async (input: any, init?: RequestInit) => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://synthetic.invalid', 'no real provider or other network access');
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url.pathname.endsWith('/signup')) {
      assert.equal(url.searchParams.get('redirect_to'), 'https://app.example.invalid/');
      assert.equal(body.code_challenge_method, 's256'); challenge = body.code_challenge;
      return Response.json(user);
    }
    if (url.searchParams.get('grant_type') === 'pkce') {
      assert.equal(body.auth_code, 'synthetic-code'); assert.equal(body.code_verifier, expectedVerifier); exchanges++;
      return Response.json(session);
    }
    if (url.searchParams.get('grant_type') === 'refresh_token') {
      assert.equal(body.refresh_token, 'synthetic-refresh-A'); refreshes++;
      return Response.json({ ...session, refresh_token: 'synthetic-renewed' });
    }
    if (url.pathname.endsWith('/logout')) {
      assert.equal(url.searchParams.get('scope'), 'local');
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer synthetic-access-A'); revocations++;
      return new Response(null, { status: 204 });
    }
    throw new Error('Unexpected synthetic SDK request');
  });
  const registration = await browserAuthProvider.signUp('A@example.invalid', 'synthetic-password', 'Nickname', 'https://app.example.invalid');
  assert.equal(registration.error, null); assert.equal(registration.data.session, null); assert.ok(registration.verifier);
  expectedVerifier = registration.verifier;
  assert.equal(createHash('sha256').update(expectedVerifier).digest('base64url'), challenge);
  assert.equal((await browserAuthProvider.exchange('synthetic-code', expectedVerifier)).error, null);
  assert.equal((await browserAuthProvider.refresh('synthetic-refresh-A')).data.session?.refresh_token, 'synthetic-renewed');
  assert.equal((await browserAuthProvider.signOut('synthetic-access-A')).error, null);
  assert.deepEqual([exchanges, refreshes, revocations], [1, 1, 1]);
});
