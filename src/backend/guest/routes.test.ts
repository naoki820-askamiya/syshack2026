import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { ProtocolRepository, protocolInput, protocolRuntime } from './protocol.testFixture.js';
import { makeValidV2Result } from '../ai/v2/testFixture.js';

// Importing the router may construct a Prisma adapter, but all guest I/O is injected.
// Normal APIs below reject the missing bearer before touching Auth or DB.
process.env.DATABASE_URL = 'postgresql://synthetic:synthetic@127.0.0.1:1/guest_no_network';
process.env.SUPABASE_URL = 'https://synthetic.invalid';
process.env.SUPABASE_PUBLISHABLE_KEY = 'synthetic-key';
const [{ createGuestRouter }, { errorHandler }, { default: personsRouter }, { default: casesRouter },
  { default: feedbackRouter }, { prisma }] = await Promise.all([
  import('./routes.js'), import('../middlewares/errorHandler.js'), import('../v17/persons.routes.js'),
  import('../v17/analysisCases.routes.js'), import('../v17/feedback.routes.js'), import('../prisma/client.js'),
]);

async function api(t: test.TestContext, secure = false) {
  const repo = new ProtocolRepository(); const runtime = protocolRuntime(); let enabled = true; let calls = 0;
  const app = express(); app.use(express.json());
  app.use('/api/guest', createGuestRouter({ repository: repo, runtime: () => enabled ? runtime : null,
    origin: () => runtime.origin, provider: { generate: async () => { calls++; return { terminal: true, result: makeValidV2Result() }; } } }));
  app.use('/api/persons', personsRouter); app.use('/api/analysis-cases', casesRouter); app.use('/api', feedbackRouter); app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  runtime.origin = secure ? 'https://guest.synthetic.invalid' : base; runtime.allowLocalHttp = !secure;
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  async function request(path: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) {
    const response = await fetch(base + path, { method, headers: { ...(method !== 'GET' ? { origin: runtime.origin, 'content-type': 'application/json' } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body) });
    return { response, body: await response.json() as any };
  }
  return { repo, runtime, request, calls: () => calls, off: () => { enabled = false; } };
}
test.after(async () => { await prisma.$disconnect(); });

test('explicit issuance, cookie round-trip, exact CSRF/origin and no-store boundaries', async t => {
  const f = await api(t); const missing = await f.request('/api/guest/session');
  assert.equal(missing.response.status, 404); assert.equal(f.repo.sessions.size, 0);
  const issued = await f.request('/api/guest/session', 'POST', {});
  assert.equal(issued.response.status, 201); const header = issued.response.headers.get('set-cookie')!;
  assert.match(header, /HttpOnly/u); assert.match(header, /SameSite=Strict/u); assert.match(header, /Path=\//u);
  assert.doesNotMatch(header, /Domain=/u); const cookie = header.split(';')[0];
  const rawToken = cookie.split('=')[1]; assert.equal(JSON.stringify(issued.body).includes(rawToken), false);
  const csrf = issued.body.csrfToken;
  const read = await f.request('/api/guest/session', 'GET', undefined, { cookie });
  assert.equal(read.response.status, 200); assert.match(read.response.headers.get('cache-control')!, /private, no-store/u);
  assert.equal(read.response.headers.get('set-cookie'), null, 'reads cannot slide identity lifetime');
  const consent = { accepted: true, termsVersion: f.runtime.policy.termsVersion, privacyVersion: f.runtime.policy.privacyVersion,
    consentVersion: f.runtime.policy.consentVersion };
  const rejectedHeaders: Array<Record<string, string>> = [{ cookie }, { cookie, 'x-guest-csrf': '0'.repeat(64) },
    { cookie, 'x-guest-csrf': csrf, origin: 'https://attacker.invalid' },
    { cookie, 'x-guest-csrf': csrf, origin: '' }];
  for (const headers of rejectedHeaders) {
    assert.equal((await f.request('/api/guest/consent', 'POST', consent, headers)).response.status, 403);
  }
  assert.equal((await f.request('/api/guest/consent', 'POST', consent, { cookie, 'x-guest-csrf': csrf })).response.status, 200);
  const result = await f.request('/api/guest/analyze', 'POST', protocolInput(), { cookie, 'x-guest-csrf': csrf });
  assert.equal(result.response.status, 200); assert.equal(f.calls(), 1);
  assert.equal(JSON.stringify(result.body).includes('Synthetic event'), false);
  f.off(); f.repo.limits.stopped = true;
  assert.equal((await f.request('/api/guest/result', 'GET', undefined, { cookie })).response.status, 200);
  const deleted = await f.request('/api/guest/content', 'DELETE', {}, { cookie, 'x-guest-csrf': csrf });
  assert.equal(deleted.response.status, 200); assert.equal(deleted.body.run.contentUnavailable, true); assert.equal(f.calls(), 1);
});

test('production-style host-only Cookie is Secure and kept at least through the full first-use period', async t => {
  const f = await api(t, true); const issued = await f.request('/api/guest/session', 'POST', {});
  const header = issued.response.headers.get('set-cookie')!;
  assert.match(header, /^__Host-kigen404_guest_v1=/u); assert.match(header, /; Secure/u); assert.doesNotMatch(header, /Domain=/u);
  const age = Number(/Max-Age=(\d+)/u.exec(header)![1]);
  assert.ok(age * 1000 >= f.runtime.issueTtlMs + f.runtime.policy.usedTtlMs);
});

test('guest cookie never grants normal APIs and ordinary bearer cannot select guest identity', async t => {
  const f = await api(t); const issued = await f.request('/api/guest/session', 'POST', {}); const cookie = issued.response.headers.get('set-cookie')!.split(';')[0];
  for (const path of ['/api/persons', '/api/analysis-cases/11111111-1111-4111-8111-111111111111',
    '/api/analysis-results/11111111-1111-4111-8111-111111111111/feedback']) {
    assert.equal((await f.request(path, 'GET', undefined, { cookie })).response.status, 401);
  }
  assert.equal((await f.request('/api/guest/session', 'GET', undefined, { cookie, authorization: 'Bearer synthetic' })).response.status, 400);
});

test('spoofed XFF/new cookies cannot bypass the persistent global issuance limit', async t => {
  const f = await api(t); f.repo.limits.issuanceLimit = 1;
  assert.equal((await f.request('/api/guest/session', 'POST', {}, { 'x-forwarded-for': '198.51.100.1' })).response.status, 201);
  assert.equal((await f.request('/api/guest/session', 'POST', {}, { 'x-forwarded-for': '198.51.100.2' })).response.status, 429);
  assert.equal(f.repo.sessions.size, 1); assert.equal(f.calls(), 0);
});
