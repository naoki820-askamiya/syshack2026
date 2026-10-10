import assert from 'node:assert/strict';
import test from 'node:test';
import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
process.env.SUPABASE_URL ??= 'https://test.invalid';
process.env.SUPABASE_PUBLISHABLE_KEY ??= 'synthetic-publishable';
const [{ requireAuth }, { supabaseAuth }] = await Promise.all([import('../middlewares/requireAuth.js'), import('../auth/supabase.js')]);
function replace(t: test.TestContext, implementation: (...args: any[]) => any) {
  const original = supabaseAuth.auth.getUser; supabaseAuth.auth.getUser = implementation;
  t.after(() => { supabaseAuth.auth.getUser = original; });
}

test('SDK rejection is delivered exactly once to Express next, with no identity publication', async t => {
  const sentinel = new Error('Synthetic private auth detail'); const next: unknown[] = [];
  replace(t, async () => { throw sentinel; });
  const req: any = { headers: { authorization: 'Bearer synthetic-token' } };
  await requireAuth(req, {} as any, error => { next.push(error); });
  assert.equal(next.length, 1);
  const delivered = next[0] as any;
  assert.equal(delivered.status, 500); assert.equal(delivered.code, 'INTERNAL_SERVER_ERROR');
  assert.equal(delivered.cause, sentinel); assert.equal(delivered.message, 'サーバー内部エラーが発生しました。');
  assert.equal(req.userId, undefined); assert.equal(req.userEmail, undefined);
});

test('ordinary SDK authentication error remains one 401 and never publishes identity', async t => {
  const next: any[] = []; replace(t, async () => ({ data: { user: null }, error: new Error('Synthetic invalid token') }));
  const req: any = { headers: { authorization: 'Bearer synthetic-token' } };
  await requireAuth(req, {} as any, error => { next.push(error); });
  assert.equal(next.length, 1); assert.equal(next[0].status, 401); assert.equal(next[0].code, 'UNAUTHENTICATED');
  assert.equal(req.userId, undefined);
});

test('successful SDK auth retains ownership publication and missing header sends no SDK request', async t => {
  let calls = 0; const next: any[] = [];
  replace(t, async (token: string) => { calls++; assert.equal(token, 'synthetic-token'); return { data: { user: { id: 'owned-user', email: null } }, error: null }; });
  const req: any = { headers: { authorization: 'Bearer synthetic-token' } };
  await requireAuth(req, {} as any, error => { next.push(error); });
  assert.equal(next.length, 1); assert.equal(next[0], undefined); assert.equal(req.userId, 'owned-user'); assert.equal(req.userEmail, null);
  await requireAuth({ headers: {} } as any, {} as any, error => { next.push(error); });
  assert.equal(next[1].status, 401); assert.equal(calls, 1);
});

for (const sdkError of [new AuthRetryableFetchError('Synthetic private SDK detail', 0), new AuthRetryableFetchError('Synthetic private SDK detail', 503), new AuthApiError('Synthetic private SDK detail', 500, 'PRIVATE_CODE')]) {
  test('returned SDK infrastructure error is delivered once without publishing identity: ' + sdkError.status, async t => {
    const next: any[] = [];
    replace(t, async () => ({ data: { user: { id: 'must-not-publish', email: 'synthetic@example.invalid' } }, error: sdkError }));
    const req: any = { headers: { authorization: 'Bearer synthetic-token' } };
    await requireAuth(req, {}, error => { next.push(error); });
    assert.equal(next.length, 1); assert.equal(next[0].status, 500); assert.equal(next[0].code, 'INTERNAL_SERVER_ERROR');
    assert.equal(next[0].message, 'サーバー内部エラーが発生しました。'); assert.equal(next[0].cause, sdkError);
    assert.equal(req.userId, undefined); assert.equal(req.userEmail, undefined);
  });
}
