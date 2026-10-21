import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrismaClient } from '../generated/prisma/client.js';
import { createGuestRepository } from './repository.js';
import type { GuestPolicy, GuestRun, GuestSession } from './types.js';

const ID = '11111111-1111-4111-8111-111111111111';
const RUN = '22222222-2222-4222-8222-222222222222';
const INTENT = '33333333-3333-4333-8333-333333333333';
const EXECUTOR = '44444444-4444-4444-8444-444444444444';
const now = new Date('2026-10-21T00:00:00Z');
const policy: GuestPolicy = { model: 'synthetic', pricingVersion: 'synthetic-price', tokenBoundVersion: 'synthetic-bound',
  inputTokenBound: 100, maxOutputTokens: 100, maxCostMicros: '10', promptVersion: 'synthetic-prompt', schemaVersion: 'synthetic-schema',
  termsVersion: 'synthetic-terms', privacyVersion: 'synthetic-privacy', consentVersion: 'synthetic-consent', contentTtlMs: 86_400_000, usedTtlMs: 2_592_000_000 };
const budget = { stopped: false, maxCostMicros: '100', maxRequests: 10, maxConcurrent: 2, issuanceLimit: '100',
  issueWindowSeconds: 60, issueWindowLimit: 10, occupiedMicros: '0', occupiedRequests: 0, activeRuns: 0, issuedTotal: 0n };
const session: GuestSession & { now: Date } = { id: ID, tokenHash: 'a'.repeat(64), issuedExpiresAt: new Date(now.getTime() + 10000),
  usedUntil: null, revokedAt: null, consentVersion: policy.consentVersion, termsVersion: policy.termsVersion,
  privacyVersion: policy.privacyVersion, consentedAt: now, now };
const run: GuestRun = { id: RUN, sessionId: ID, intent: INTENT, fingerprint: 'saved', state: 'RESERVED', policy,
  input: { synthetic: true }, result: null, deletedAt: null, contentExpiresAt: new Date(now.getTime() + policy.contentTtlMs),
  authorizedAt: null, executor: EXECUTOR, terminal: false };

// These tests exercise repository decision boundaries and SQL bindings, not SQL
// execution/transaction isolation. The disposable PostgreSQL suite covers that.
function harness(rows: unknown[][], executeResults: number[] = []) {
  const calls: Array<{ kind: string; sql: string; values: unknown[] }> = [];
  const statement = (value: unknown, values: unknown[]) => {
    if (Array.isArray(value)) return { sql: value.join('?'), values };
    const query = value as { text: string; values: unknown[] };
    return { sql: query.text, values: query.values };
  };
  const tx = {
    $queryRaw: async (query: unknown, ...values: unknown[]) => {
      calls.push({ kind: 'query', ...statement(query, values) });
      assert.ok(rows.length > 0, 'unexpected extra query');
      return rows.shift();
    },
    $executeRaw: async (query: unknown, ...values: unknown[]) => {
      calls.push({ kind: 'execute', ...statement(query, values) });
      return executeResults.shift() ?? 1;
    },
  };
  let commitFailure: Error | null = null;
  const db = { ...tx, $transaction: async (operation: (value: typeof tx) => Promise<unknown>) => {
    const result = await operation(tx);
    if (commitFailure) throw commitFailure;
    return result;
  } };
  return { repository: createGuestRepository(db as unknown as PrismaClient), calls,
    failCommit(error: Error) { commitFailure = error; } };
}

test('public budget strips bigint-only internal issue counter', async () => {
  const f = harness([[budget]]);
  const result = await f.repository.budget();
  assert.equal(result.issuanceLimit, 100);
  assert.equal('issuedTotal' in result, false);
  assert.doesNotThrow(() => JSON.stringify(result));
});

test('stopped or incomplete persistent budget prevents issuance before any insert', async () => {
  for (const change of [{ stopped: true }, { maxCostMicros: null }, { maxConcurrent: 0 }, { issuanceLimit: '9007199254740992' }]) {
    const f = harness([[{ ...budget, ...change }]]);
    await assert.rejects(f.repository.issue('a'.repeat(64), new Date(now.getTime() + 1000)), (e: any) => e.code === 'GUEST_UNAVAILABLE');
    assert.equal(f.calls.length, 1);
    assert.match(f.calls[0].sql, /FOR UPDATE/u);
  }
});

test('issuance timestamps are taken after the global lock, not at transaction start', async () => {
  const f = harness([[budget], [{ now }], [{ count: 0n }], [session]]);
  await f.repository.issue('a'.repeat(64), new Date(now.getTime() + 10000));
  const insert = f.calls.find(call => /INSERT INTO guest_v1_sessions/u.test(call.sql))!;
  assert.match(insert.sql, /created_at, updated_at/u);
  assert.match(insert.sql, /clock_timestamp\(\), clock_timestamp\(\)/u);
  assert.doesNotMatch(insert.sql, /\bnow\(\)/u);
});

test('same intent/fingerprint replays saved run before stopped/config/consent checks', async () => {
  const f = harness([[{ ...budget, stopped: true, maxCostMicros: null }], [session], [{ id: RUN, fingerprint: 'saved' }], [run]]);
  const result = await f.repository.reserve(ID, INTENT, 'saved', { ignored: true }, { ...policy, model: 'changed' }, EXECUTOR);
  assert.equal(result.created, false);
  assert.equal(result.run.policy.model, 'synthetic');
  assert.equal(f.calls.some(call => call.kind === 'execute'), false);
});

test('owned historical lookup binds both session and intent without config or new reservation', async () => {
  const f = harness([[{ ...run, state: 'CANCELLED', input: null, deletedAt: now }]]);
  assert.equal((await f.repository.current(ID, INTENT))?.state, 'CANCELLED');
  assert.ok(f.calls[0].values.includes(ID));
  assert.ok(f.calls[0].values.includes(INTENT));
  assert.match(f.calls[0].sql, /r\.session_id =/u);
  assert.match(f.calls[0].sql, /r\.intent =/u);
  assert.equal(f.calls.length, 1);
});

test('same intent with different content is409 without returning or mutating saved content', async () => {
  const f = harness([[budget], [session], [{ id: RUN, fingerprint: 'saved' }]]);
  await assert.rejects(f.repository.reserve(ID, INTENT, 'different', {}, policy, EXECUTOR), (e: any) => e.status === 409 && e.code === 'GUEST_INTENT_CONFLICT');
  assert.equal(f.calls.length, 3);
  assert.equal(f.calls.some(call => call.kind === 'execute'), false);
});

test('all global ceilings reject the new reservation before any write', async () => {
  for (const occupied of [{ occupiedMicros: '91' }, { occupiedRequests: 10 }, { activeRuns: 2 }]) {
    const f = harness([[{ ...budget, ...occupied }], [session], [], []]);
    await assert.rejects(f.repository.reserve(ID, INTENT, 'new', {}, policy, EXECUTOR),
      (e: any) => e.code === 'GUEST_LIMIT_REACHED' && e.status === 429);
    assert.equal(f.calls.some(call => call.kind === 'execute'), false);
    assert.equal(f.calls.some(call => /INSERT INTO/u.test(call.sql)), false);
  }
});

test('authorization is single-use, and confirmed commit is required to return its permit', async () => {
  const authorized = { ...run, state: 'DISPATCH_AUTHORIZED', authorizedAt: now };
  const replay = harness([[budget], [authorized]]);
  assert.equal(await replay.repository.authorize(RUN, EXECUTOR), null);
  assert.equal(replay.calls.length, 2);
  const first = harness([[budget], [run], [session], [{ id: RUN }], [authorized]]);
  const failure = new Error('synthetic commit acknowledgement lost');
  first.failCommit(failure);
  await assert.rejects(first.repository.authorize(RUN, EXECUTOR), error => error === failure);
  const identity = first.calls.find(call => /UPDATE guest_v1_sessions/u.test(call.sql))!;
  assert.match(identity.sql, /SELECT authorized_at/u);
  assert.ok(identity.values.includes(policy.usedTtlMs));
  assert.match(first.calls[2].sql, /clock_timestamp/u);
});

test('authorization rechecks revocation, exact saved consent, content deadline and stop flag', async () => {
  for (const change of [{ revokedAt: now }, { consentVersion: 'changed' }, { now: run.contentExpiresAt }]) {
    const f = harness([[budget], [run], [{ ...session, ...change }]]);
    assert.equal(await f.repository.authorize(RUN, EXECUTOR), null);
    assert.equal(f.calls.some(call => call.kind === 'execute'), false);
  }
  const stopped = harness([[{ ...budget, stopped: true }], [run], [session]]);
  assert.equal(await stopped.repository.authorize(RUN, EXECUTOR), null);
  assert.equal(stopped.calls.some(call => call.kind === 'execute'), false);
  const invalidSnapshot = harness([[budget], [{ ...run, policy: { ...policy, maxOutputTokens: 0 } }], [session]]);
  await assert.rejects(invalidSnapshot.repository.authorize(RUN, EXECUTOR), (e: any) => e.code === 'GUEST_UNAVAILABLE');
  assert.equal(invalidSnapshot.calls.some(call => call.kind === 'execute'), false);
});

test('predispatch cancellation returns its exact receipt once; a repeated CAS miss does not refund', async () => {
  const first = harness([[budget], [{ id: RUN }], [{ cost: 10n }]]);
  await first.repository.cancel(RUN, EXECUTOR);
  const debit = first.calls.find(call => call.kind === 'execute')!;
  assert.match(debit.sql, /occupied_micros = occupied_micros -/u);
  assert.ok(debit.values.includes(10n));
  assert.ok(first.calls[1].values.includes(EXECUTOR));
  const again = harness([[budget], []]);
  await again.repository.cancel(RUN, EXECUTOR);
  assert.equal(again.calls.some(call => call.kind === 'execute'), false);
});

test('unknown keeps all occupancy and stops admissions, terminal only returns a concurrency slot', async () => {
  const dispatched = { ...run, state: 'DISPATCH_AUTHORIZED', authorizedAt: now };
  const unknown = harness([[budget], [dispatched], [session]]);
  await unknown.repository.finish(RUN, EXECUTOR, { terminal: false });
  assert.ok(unknown.calls.some(call => /stopped = true/u.test(call.sql)));
  assert.equal(unknown.calls.some(call => /active_runs = active_runs -/u.test(call.sql)), false);
  const terminal = harness([[budget], [dispatched], [session]]);
  await terminal.repository.finish(RUN, EXECUTOR, { terminal: true, result: { synthetic: true } });
  assert.ok(terminal.calls.some(call => /active_runs = active_runs -/u.test(call.sql)));
  assert.equal(terminal.calls.some(call => /occupied_micros = occupied_micros -/u.test(call.sql)), false);
  assert.equal(terminal.calls.some(call => /occupied_requests = occupied_requests -/u.test(call.sql)), false);
});

test('revoked or expired content is not written back by a late terminal response', async () => {
  for (const revoked of [true, false]) {
    const dispatched = { ...run, state: 'DISPATCH_AUTHORIZED', authorizedAt: now,
      contentExpiresAt: revoked ? run.contentExpiresAt : new Date(now.getTime() - 1) };
    const f = harness([[budget], [dispatched], [{ ...session, revokedAt: revoked ? now : null }]]);
    await f.repository.finish(RUN, EXECUTOR, { terminal: true, result: { secret: 'must not persist' } });
    const update = f.calls.find(call => /UPDATE guest_v1_runs SET state/u.test(call.sql))!;
    assert.equal(update.values.some(value => typeof value === 'string' && value.includes('must not persist')), false);
    assert.ok(update.values.includes(null));
  }
});

test('delete revokes the credential before clearing payload and cannot release authorized funds', async () => {
  const f = harness([[budget], [session], []]);
  await f.repository.erase(ID);
  const revoke = f.calls.findIndex(call => /SET revoked_at/u.test(call.sql));
  const clear = f.calls.findIndex(call => /SET deleted_at/u.test(call.sql));
  assert.ok(revoke >= 0 && clear > revoke);
  assert.equal(f.calls.some(call => /occupied_micros = occupied_micros -/u.test(call.sql)), false);
});

test('startup recovery revokes reserved executors before refund and retains unknown occupancy while stopping', async () => {
  const f = harness([[budget], [{ id: RUN }], [{ id: RUN }], [{ cost: 10n }], [{ id: 'another-authorized-run' }], [{ exists: true }]]);
  await f.repository.recover();
  const cancel = f.calls.findIndex(call => /SET state = 'CANCELLED'/u.test(call.sql));
  const refund = f.calls.findIndex(call => /occupied_micros = occupied_micros -/u.test(call.sql));
  assert.ok(cancel >= 0 && refund > cancel);
  assert.ok(f.calls.some(call => /state = 'DISPATCH_AUTHORIZED' RETURNING id/u.test(call.sql)));
  assert.ok(f.calls.some(call => /stopped = true/u.test(call.sql)));
  assert.equal(f.calls.filter(call => /active_runs = active_runs -/u.test(call.sql)).length, 1, 'only RESERVED cancellation returns a slot');
  const existingUnknown = harness([[budget], [], [], [{ exists: true }]]);
  await existingUnknown.repository.recover();
  assert.ok(existingUnknown.calls.some(call => /stopped = true/u.test(call.sql)));
  assert.equal(existingUnknown.calls.some(call => /occupied_micros = occupied_micros -/u.test(call.sql)), false);
});
