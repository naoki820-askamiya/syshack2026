import assert from 'node:assert/strict';
import test, { before, after } from 'node:test';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { TERMS_VERSION, PRIVACY_POLICY_VERSION } from '../../shared/legal.js';

process.env.DATABASE_URL ??= 'postgresql://test:test@127.0.0.1:5432/consent_test';
process.env.SUPABASE_URL ??= 'https://test.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY ??= 'test-key';
const [{ createServerApp }, { prisma }, { supabaseAuth }] = await Promise.all([
  import('../server.js'), import('../prisma/client.js'), import('../auth/supabase.js'),
]);
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
let server: Server;
let base: string;
before(async () => {
  server = (await createServerApp()).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); await prisma.$disconnect(); });
function replace(t: test.TestContext, object: object, key: string, fn: (...args: any[]) => any) {
  const methods = object as Record<string, unknown>;
  const original = methods[key]; const mock = t.mock.fn(fn); methods[key] = mock;
  t.after(() => { methods[key] = original; }); return mock;
}
function fixture(t: test.TestContext) {
  const rows: Array<{ userId: string; termsVersion: string; privacyPolicyVersion: string; consentedAt: Date }> = [];
  replace(t, supabaseAuth.auth, 'getUser', async () => ({ data: { user: { id: owner, email: 'fixture@example.com' } }, error: null }));
  replace(t, prisma.userConsentRecord, 'findFirst', async ({ where }) => rows.find(row => row.userId === where.userId && row.termsVersion === where.termsVersion && row.privacyPolicyVersion === where.privacyPolicyVersion) ?? null);
  const create = replace(t, prisma.userConsentRecord, 'create', async ({ data }) => { const row = { ...data, consentedAt: new Date('2026-10-07T00:00:00Z') }; rows.push(row); return row; });
  const lock = t.mock.fn(async () => [{ locked: 1 }]);
  replace(t, prisma, '$transaction', async fn => fn({ userConsentRecord: prisma.userConsentRecord, $queryRaw: lock }));
  return { rows, create, lock };
}
const body = () => ({ accepted: true, termsVersion: TERMS_VERSION, privacyPolicyVersion: PRIVACY_POLICY_VERSION });
async function request(path: string, method = 'GET', data?: unknown, authenticated = true) {
  const response = await fetch(base + path, { method, headers: { ...(authenticated ? { authorization: 'Bearer fixture' } : {}), ...(data ? { 'content-type': 'application/json' } : {}) }, body: data ? JSON.stringify(data) : undefined });
  const payload = await response.json() as { accepted?: boolean; consentedAt?: string | null; error?: { code: string } };
  return { status: response.status, body: payload };
}
test('consent endpoints require authenticated identity', async () => {
  for (const method of ['GET', 'POST']) assert.equal((await request('/api/legal-consent', method, method === 'POST' ? body() : undefined, false)).status, 401);
});
test('current consent only sees the authenticated owner and exact document versions', async t => {
  const f = fixture(t);
  f.rows.push({ userId: other, termsVersion: TERMS_VERSION, privacyPolicyVersion: PRIVACY_POLICY_VERSION, consentedAt: new Date() });
  f.rows.push({ userId: owner, termsVersion: 'older', privacyPolicyVersion: PRIVACY_POLICY_VERSION, consentedAt: new Date() });
  assert.deepEqual(await request('/api/legal-consent'), { status: 200, body: { accepted: false, termsVersion: TERMS_VERSION, privacyPolicyVersion: PRIVACY_POLICY_VERSION, consentedAt: null } });
});
test('explicit current acknowledgement records server time and replay preserves one record', async t => {
  const f = fixture(t);
  const first = await request('/api/legal-consent', 'POST', body());
  assert.equal(first.status, 200); assert.equal(first.body.accepted, true);
  assert.equal(first.body.consentedAt, '2026-10-07T00:00:00.000Z');
  assert.deepEqual(await request('/api/legal-consent', 'POST', body()), first);
  assert.equal(f.create.mock.callCount(), 1); assert.equal(f.lock.mock.callCount(), 2);
  assert.deepEqual(f.create.mock.calls[0].arguments, [{ data: { userId: owner, termsVersion: TERMS_VERSION, privacyPolicyVersion: PRIVACY_POLICY_VERSION } }]);
  assert.equal((await request('/api/legal-consent')).body.accepted, true);
});
test('missing/false acknowledgement, stale versions and client identity/metadata are rejected', async t => {
  const f = fixture(t);
  for (const invalid of [{}, { ...body(), accepted: false }, { ...body(), termsVersion: 'older' }, { ...body(), privacyPolicyVersion: 'older' }, { ...body(), userId: other }, { ...body(), consentedAt: '1999-01-01' }, { ...body(), ipAddressHash: 'client-value' }]) {
    assert.equal((await request('/api/legal-consent', 'POST', invalid)).status, 400);
  }
  assert.equal(f.create.mock.callCount(), 0);
});
test('unaccepted/old-version users cannot save or analyze a consultation; no workflow starts', async t => {
  const f = fixture(t);
  f.rows.push({ userId: owner, termsVersion: 'older', privacyPolicyVersion: 'older', consentedAt: new Date() });
  for (const path of ['/api/analysis-cases', '/api/analysis-cases/33333333-3333-4333-8333-333333333333/analyze']) {
    const response = await request(path, 'POST', {});
    assert.equal(response.status, 403); assert.equal(response.body.error?.code, 'LEGAL_CONSENT_REQUIRED');
  }
  assert.equal(f.lock.mock.callCount(), 0); assert.equal(f.create.mock.callCount(), 0);
});
test('database failure is not presented as recorded consent', async t => {
  fixture(t);
  replace(t, prisma, '$transaction', async () => { throw new Error('PRIVATE_DB_DETAIL'); });
  const response = await request('/api/legal-consent', 'POST', body());
  assert.equal(response.status, 500); assert.equal(JSON.stringify(response.body).includes('PRIVATE_DB_DETAIL'), false);
});

for (const update of ['terms', 'privacy', 'both']) test(`existing users must reconsent after a ${update} version update, preserving past records`, async t => {
  const f = fixture(t);
  const previous = { userId: owner, termsVersion: update === 'privacy' ? TERMS_VERSION : 'previous-terms',
    privacyPolicyVersion: update === 'terms' ? PRIVACY_POLICY_VERSION : 'previous-privacy', consentedAt: new Date('2026-10-06T00:00:00Z') };
  f.rows.push(previous);
  assert.equal((await request('/api/legal-consent')).body.accepted, false);
  for (const path of ['/api/analysis-cases', '/api/analysis-cases/33333333-3333-4333-8333-333333333333/analyze']) {
    assert.equal((await request(path, 'POST', {})).status, 403);
  }
  assert.equal((await request('/api/legal-consent', 'POST', body())).status, 200);
  assert.equal((await request('/api/legal-consent')).body.accepted, true);
  // An invalid consultation now reaches body validation, rather than the consent gate.
  assert.equal((await request('/api/analysis-cases', 'POST', {})).status, 400);
  assert.equal((await request('/api/legal-consent', 'POST', body())).status, 200);
  assert.equal(f.create.mock.callCount(), 1); assert.equal(f.rows.length, 2); assert.deepEqual(f.rows[0], previous);
});

test('users with no current consent can still read history and manage personalization', async t => {
  fixture(t);
  replace(t, prisma.person, 'findFirst', async ({ where }) => { assert.equal(where.userId, owner); return { id: where.id, userId: owner }; });
  replace(t, prisma.analysisCase, 'findMany', async ({ where }) => { assert.equal(where.userId, owner); return []; });
  replace(t, prisma.userPrivacySetting, 'upsert', async ({ where }) => { assert.equal(where.userId, owner); return { userId: owner, personalizationEnabled: false }; });
  assert.equal((await request('/api/persons/33333333-3333-4333-8333-333333333333/analysis-cases')).status, 200);
  assert.equal((await request('/api/privacy-settings')).status, 200);
  assert.equal((await request('/api/privacy-settings', 'PATCH', { personalizationEnabled: false })).status, 200);
});
