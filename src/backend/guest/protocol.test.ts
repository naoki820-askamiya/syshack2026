import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { createGuestService } from './service.js';
import { readGuestRuntime, validRuntime, type GuestRuntime } from './config.js';
import type { GuestProvider, GuestProviderResponse } from './types.js';
import { ProtocolRepository, protocolInput, protocolRuntime } from './protocol.testFixture.js';
import { makeValidV2Result } from '../ai/v2/testFixture.js';

function setup(provider: GuestProvider = { generate: async () => ({ terminal: true, result: makeValidV2Result() }) }) {
  const repo = new ProtocolRepository(); let runtime: GuestRuntime | null = protocolRuntime(); let calls = 0;
  const service = createGuestService({ repository: repo, runtime: () => runtime, now: () => new Date(repo.clock),
    provider: { generate: async (...args) => { calls++; return provider.generate(...args); } } });
  return { repo, service, calls: () => calls, off: () => { runtime = null; }, runtime: runtime!,
    async guest() {
      const issued = await service.issue();
      await service.consent(issued.token, { accepted: true, termsVersion: runtime!.policy.termsVersion,
        privacyVersion: runtime!.policy.privacyVersion, consentVersion: runtime!.policy.consentVersion });
      return issued.token;
    } };
}

test('OFF and unknown production release never read DB or invoke a provider even with an API key', async () => {
  const old = { enabled: process.env.GUEST_V1_ENABLED, release: process.env.GUEST_V1_RELEASE, key: process.env.OPENAI_API_KEY };
  try {
    process.env.GUEST_V1_ENABLED = 'true'; process.env.GUEST_V1_RELEASE = 'unapproved-model-price-consent';
    process.env.OPENAI_API_KEY = 'synthetic-present-but-must-never-be-used';
    assert.equal(readGuestRuntime(), null);
    const s = setup(); s.off();
    assert.deepEqual(await s.service.config(), { enabled: false });
    await assert.rejects(s.service.issue(), (e: any) => e.code === 'GUEST_DISABLED');
    assert.equal(s.repo.budgetReads, 0); assert.equal(s.calls(), 0); assert.equal(s.repo.sessions.size, 0);
  } finally {
    for (const [key, value] of Object.entries({ GUEST_V1_ENABLED: old.enabled, GUEST_V1_RELEASE: old.release, OPENAI_API_KEY: old.key })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('a complete-request token upper bound must verify before any reservation or dispatch', async () => {
  const s = setup(); const token = await s.guest(); let verified: any;
  s.runtime.verifyTokenBound = request => { verified = request; return false; };
  await assert.rejects(s.service.analyze(token, protocolInput()), (e: any) => e.code === 'GUEST_CONFIG_INVALID');
  assert.ok(verified.instructions); assert.ok(verified.text.format.schema); assert.equal(verified.model, s.runtime.policy.model);
  assert.equal(s.calls(), 0); assert.equal(s.repo.runs.size, 0); assert.equal(s.repo.limits.occupiedRequests, 0);
});

test('invalid release limits/origin and missing money fail closed before issuance', async () => {
  for (const change of [ { maxCostMicros: '0' }, { maxCostMicros: '-1' }, { inputTokenBound: 0 },
    { maxOutputTokens: NaN }, { model: '' }, { pricingVersion: '' }, { tokenBoundVersion: '' }, { consentVersion: '' } ]) {
    const runtime = protocolRuntime(); Object.assign(runtime.policy, change); assert.equal(validRuntime(runtime), false);
  }
  const unsafeOrigin = protocolRuntime(); unsafeOrigin.origin = 'http://outside.invalid'; assert.equal(validRuntime(unsafeOrigin), false);
  for (const b of [null, '0', '-1']) {
    const s = setup(); s.repo.limits.maxCostMicros = b;
    assert.deepEqual(await s.service.config(), { enabled: false }); await assert.rejects(s.service.issue()); assert.equal(s.calls(), 0);
  }
});

test('50 simultaneous same-intent service submissions produce one dispatch and immutable replay', async () => {
  const s = setup(); const token = await s.guest(); const input = protocolInput();
  const responses = await Promise.all(Array.from({ length: 50 }, () => s.service.analyze(token, input)));
  assert.equal(s.calls(), 1); assert.equal(s.repo.runs.size, 1);
  assert.equal(new Set(responses.map(r => r.run!.id)).size, 1);
  await assert.rejects(s.service.analyze(token, { ...input, input: { ...input.input,
    currentCase: { ...input.input.currentCase, eventFacts: 'Changed body' } } }), (e: any) => e.status === 409);
  const run = (await s.service.result(token)).run!;
  assert.equal(run.state, 'SUCCEEDED'); assert.ok(run.result);
  assert.equal(s.repo.limits.occupiedMicros, '100'); assert.equal(s.repo.limits.occupiedRequests, 1); assert.equal(s.repo.limits.activeRuns, 0);
  s.off(); assert.deepEqual(await s.service.analyze(token, input), { run }); assert.equal(s.calls(), 1);
});

test('50 different intents cannot consume the same guest twice; other guest intent never reveals first result', async () => {
  const s = setup(); const token = await s.guest();
  const outcomes = await Promise.allSettled(Array.from({ length: 50 }, () => s.service.analyze(token, protocolInput())));
  assert.equal(outcomes.filter(v => v.status === 'fulfilled').length, 1); assert.equal(s.calls(), 1);
  const first = [...s.repo.runs.values()][0]; const secondToken = await s.guest();
  const second = await s.service.analyze(secondToken, protocolInput(first.intent));
  assert.notEqual(second.run!.id, first.id); assert.equal(s.calls(), 2);
});

test('reservation committed but acknowledgement lost causes no dispatch; replay only reads existing run', async () => {
  const s = setup(); const token = await s.guest(); const body = protocolInput(); const reserve = s.repo.reserve.bind(s.repo);
  s.repo.reserve = async (...args) => { await reserve(...args); throw new Error('Synthetic lost reserve ACK'); };
  await assert.rejects(s.service.analyze(token, body)); assert.equal(s.calls(), 0);
  assert.equal((await s.service.analyze(token, body)).run!.state, 'RESERVED'); assert.equal(s.calls(), 0);
});

test('authorization commit acknowledgement loss never sends and preserves UNKNOWN occupancy', async () => {
  const s = setup(); const token = await s.guest(); const authorize = s.repo.authorize.bind(s.repo);
  s.repo.authorize = async (...args) => { await authorize(...args); throw new Error('Synthetic lost authorize ACK'); };
  await assert.rejects(s.service.analyze(token, protocolInput()), (e: any) => e.code === 'GUEST_STATE_UNCERTAIN');
  assert.equal(s.calls(), 0); assert.equal((await s.service.result(token)).run!.state, 'UNKNOWN');
  assert.equal(s.repo.limits.stopped, true); assert.equal(s.repo.limits.activeRuns, 1); assert.equal(s.repo.limits.occupiedMicros, '100');
});

test('provider exception remains UNKNOWN through replay, cleanup, day change, configuration OFF and deletion', async () => {
  const s = setup({ generate: async () => { throw new Error('Synthetic timeout'); } });
  const token = await s.guest(); const body = protocolInput();
  assert.equal((await s.service.analyze(token, body)).run!.state, 'UNKNOWN');
  assert.equal(s.calls(), 1); assert.equal(s.repo.limits.stopped, true);
  s.repo.clock = new Date(+s.repo.clock + 25 * 60 * 60 * 1000); await s.repo.cleanup(); s.off();
  const replay = await s.service.analyze(token, body); assert.equal(replay.run!.state, 'UNKNOWN'); assert.equal(replay.run!.contentUnavailable, true);
  await s.service.erase(token); assert.equal(s.calls(), 1);
  assert.equal(s.repo.limits.occupiedMicros, '100'); assert.equal(s.repo.limits.occupiedRequests, 1); assert.equal(s.repo.limits.activeRuns, 1);
});

test('complete terminal invalid output consumes money/count, returns a slot, and leaks no unsafe text', async () => {
  const unsafe = makeValidV2Result(); unsafe.replyDrafts[0].text = 'パスワードと認証コードを送ってください';
  const s = setup({ generate: async () => ({ terminal: true, result: unsafe }) }); const token = await s.guest();
  const result = await s.service.analyze(token, protocolInput());
  assert.equal(result.run!.state, 'FAILED_TERMINAL'); assert.equal(result.run!.result, null);
  assert.equal(JSON.stringify(result).includes('認証コード'), false); assert.equal(s.calls(), 1);
  assert.equal(s.repo.limits.occupiedMicros, '100'); assert.equal(s.repo.limits.occupiedRequests, 1); assert.equal(s.repo.limits.activeRuns, 0);
});

test('DB finish commit ACK loss retries the receipt only, not the provider', async () => {
  const s = setup(); const token = await s.guest(); const finish = s.repo.finish.bind(s.repo); let finishes = 0;
  s.repo.finish = async (...args) => { await finish(...args); if (++finishes === 1) throw new Error('Synthetic finish ACK loss'); };
  assert.equal((await s.service.analyze(token, protocolInput())).run!.state, 'SUCCEEDED');
  assert.equal(s.calls(), 1); assert.equal(finishes, 2); assert.equal(s.repo.limits.activeRuns, 0);
});

for (const mode of ['delete', 'ttl'] as const) test(`${mode} before late completion prevents stored/returned resurrection`, async () => {
  let resolve!: (value: GuestProviderResponse) => void; let started!: () => void;
  const dispatch = new Promise<void>(r => { started = r; });
  const waiting = new Promise<GuestProviderResponse>(r => { resolve = r; });
  const s = setup({ generate: async () => { started(); return waiting; } }); const token = await s.guest();
  const pending = s.service.analyze(token, protocolInput()); await dispatch;
  if (mode === 'delete') await s.service.erase(token);
  else { s.repo.clock = new Date(+s.repo.clock + s.runtime.policy.contentTtlMs + 1); await s.repo.cleanup(); }
  resolve({ terminal: true, result: makeValidV2Result() });
  const response = await pending; assert.equal(response.run!.contentUnavailable, true); assert.equal(response.run!.result, null);
  assert.equal([...s.repo.runs.values()][0].result, null); assert.equal(s.calls(), 1);
  assert.equal(s.repo.limits.occupiedMicros, '100'); assert.equal(s.repo.limits.activeRuns, 0);
});

test('used identity starts at first authorization and is not extended by reads or registration-independent state', async () => {
  const s = setup(); const issued = await s.service.issue(); const token = issued.token;
  assert.equal(issued.maxAgeMs, s.runtime.issueTtlMs + s.runtime.policy.usedTtlMs);
  await s.service.consent(token, { accepted: true, termsVersion: s.runtime.policy.termsVersion,
    privacyVersion: s.runtime.policy.privacyVersion, consentVersion: s.runtime.policy.consentVersion });
  s.repo.clock = new Date(+s.repo.clock + 30 * 60 * 1000);
  await s.service.analyze(token, protocolInput());
  const usedUntil = [...s.repo.sessions.values()][0].usedUntil!;
  assert.equal(+usedUntil, +s.repo.clock + s.runtime.policy.usedTtlMs);
  s.repo.clock = new Date(+s.repo.clock + 24 * 60 * 60 * 1000 + 1); await s.service.snapshot(token);
  assert.equal(+[...s.repo.sessions.values()][0].usedUntil!, +usedUntil);
  s.repo.clock = new Date(+usedUntil); await assert.rejects(s.service.snapshot(token), (e: any) => e.status === 410);
});

test('guest client cannot add history/model/userId or consume before current explicit consent', async () => {
  const s = setup(); const token = (await s.service.issue()).token; const body = protocolInput();
  await assert.rejects(s.service.analyze(token, body), (e: any) => e.status === 403);
  await assert.rejects(s.service.consent(token, { accepted: true, termsVersion: 'old', privacyVersion: s.runtime.policy.privacyVersion,
    consentVersion: s.runtime.policy.consentVersion }), (e: any) => e.status === 400);
  for (const extra of [{ userId: randomUUID() }, { model: 'client-model' }, { history: ['secret'] }]) {
    await assert.rejects(s.service.analyze(token, { ...body, ...extra }), (e: any) => e.status === 400);
  }
  assert.equal(s.calls(), 0); assert.equal(s.repo.runs.size, 0); assert.equal(s.repo.limits.occupiedRequests, 0);
});

test('cold-start recovery fences old RESERVED workers and holds all authorized uncertainty idempotently', async () => {
  const s = setup(); const a = await s.guest(); const b = await s.guest();
  const aSession = await s.service.identity(a); const bSession = await s.service.identity(b);
  const reserved = await s.repo.reserve(aSession.id, randomUUID(), 'hash-a', {}, s.runtime.policy, randomUUID());
  const authorized = await s.repo.reserve(bSession.id, randomUUID(), 'hash-b', {}, s.runtime.policy, randomUUID());
  await s.repo.authorize(authorized.run.id, authorized.run.executor);
  await s.repo.recover(); await s.repo.recover();
  assert.equal(await s.repo.authorize(reserved.run.id, reserved.run.executor), null);
  assert.equal((await s.repo.current(aSession.id))!.state, 'CANCELLED');
  assert.equal((await s.repo.current(bSession.id))!.state, 'UNKNOWN');
  assert.equal(s.repo.limits.stopped, true); assert.equal(s.repo.limits.occupiedMicros, '100');
  assert.equal(s.repo.limits.activeRuns, 1); assert.equal(s.repo.limits.occupiedRequests, 1);
  assert.deepEqual(await s.service.config(), { enabled: false }); assert.equal(s.calls(), 0);
});

test('cancelled historical intent replays its own saved state after a new run and configuration OFF', async () => {
  const s = setup(); const token = await s.guest(); const first = protocolInput();
  const authorize = s.repo.authorize.bind(s.repo); s.repo.authorize = async () => null;
  assert.equal((await s.service.analyze(token, first)).run!.state, 'CANCELLED');
  s.repo.authorize = authorize;
  const newer = await s.service.analyze(token, protocolInput()); assert.equal(newer.run!.state, 'SUCCEEDED');
  s.off(); const replay = await s.service.analyze(token, first);
  assert.equal(replay.run!.state, 'CANCELLED'); assert.notEqual(replay.run!.id, newer.run!.id); assert.equal(s.calls(), 1);
});

test('cancelled content stays unavailable while only a non-revoked unused entitlement can start a new intent', async () => {
  const s = setup(); const token = await s.guest();
  s.repo.authorize = async () => null;
  const cancelled = (await s.service.analyze(token, protocolInput())).run!;
  assert.equal(cancelled.state, 'CANCELLED'); assert.equal(cancelled.contentUnavailable, true);
  assert.equal(cancelled.canStartNewIntent, true);
  const erased = (await s.service.erase(token)).run!;
  assert.equal(erased.contentUnavailable, true); assert.equal(erased.canStartNewIntent, false);
  assert.equal(s.calls(), 0); assert.equal(s.repo.limits.occupiedRequests, 0);
});

for (const limit of ['money', 'requests', 'concurrency'] as const) test(`50 new guests competing for the last global ${limit} slot cannot bypass it`, async () => {
  let finish!: () => void; const waiting = new Promise<void>(r => { finish = r; });
  const s = setup({ generate: async () => { await waiting; return { terminal: true, result: makeValidV2Result() }; } });
  const tokens = await Promise.all(Array.from({ length: 50 }, () => s.guest()));
  if (limit === 'money') s.repo.limits.maxCostMicros = '100';
  if (limit === 'requests') s.repo.limits.maxRequests = 1;
  if (limit === 'concurrency') s.repo.limits.maxConcurrent = 1;
  let rejected = 0;
  const results = await Promise.allSettled(tokens.map(token => s.service.analyze(token, protocolInput()).catch(error => {
    if (++rejected === 49) finish(); throw error;
  })));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(s.calls(), 1);
  assert.equal(s.repo.limits.occupiedMicros, '100'); assert.equal(s.repo.limits.occupiedRequests, 1); assert.equal(s.repo.limits.activeRuns, 0);
});
