import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { before, after } from 'node:test';
import pg from 'pg';
import { assertDisposableUrl } from './safety.mjs';
import { makeValidV2Result } from '../../src/backend/ai/v2/testFixture.js';
import { buildContextSnapshot } from '../../src/backend/ai/v2/context.js';

const runId = process.env.KIGEN404_DISPOSABLE_RUN_ID;
const databaseUrl = process.env.DB_INTEGRATION_DATABASE_URL;
assertDisposableUrl(databaseUrl, runId);
assert.equal(process.env.DATABASE_URL, databaseUrl);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const USER_QUOTA = '33333333-3333-4333-8333-333333333333';
const [{ PrismaClient }, { PrismaPg }] = await Promise.all([
  import('../../src/backend/generated/prisma/client.js'), import('@prisma/adapter-pg'),
]);
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl, max: 2 }) });
(globalThis as typeof globalThis & { prisma?: unknown }).prisma = prisma;
const repository = await import('../../src/backend/v17/workflow.repository.js');
const { settleUsage } = await import('../../src/backend/v17/rateLimit.js');
const setup = new pg.Client({ connectionString: databaseUrl });
let personA: string;
let personQuota: string;

before(async () => {
  await setup.connect();
  const identity = await setup.query('SELECT current_database() AS database');
  assert.equal(identity.rows[0].database, 'kigen404_integration_' + runId);
  await setup.query(await readFile(resolve(root, 'src/backend/prisma/init-shadow-db.sql'), 'utf8'));
  const migrations = resolve(root, 'src/backend/prisma/migrations');
  for (const name of (await readdir(migrations)).sort()) {
    if (/^\d/.test(name)) await setup.query(await readFile(resolve(migrations, name, 'migration.sql'), 'utf8'));
  }
  await setup.query('INSERT INTO auth.users(id) VALUES ($1), ($2), ($3)', [USER_A, USER_B, USER_QUOTA]);
  personA = (await prisma.person.create({ data: {
    userId: USER_A, displayName: 'Synthetic person A', relationshipType: 'coworker',
  } })).id;
  personQuota = (await prisma.person.create({ data: {
    userId: USER_QUOTA, displayName: 'Synthetic quota person', relationshipType: 'coworker',
  } })).id;
});
after(async () => { await prisma.$disconnect(); await setup.end(); });

function createCase(userId = USER_A, personId = personA) {
  return repository.createCase(userId, {
    personId, userAgeRange: 'unknown', userGender: 'unknown',
    perceivedPartnerReaction: 'unknown', elapsedTimeType: 'unknown',
    eventFacts: 'Synthetic short reply; no production user data.',
    userResponseType: 'none', userResponseText: null,
    personSnapshot: { schemaVersion: 'person-snapshot-v1', capturedAt: '2026-10-04T00:00:00Z',
      person: { displayName: 'Synthetic person', relationshipType: 'coworker' } },
  });
}
function completion(caseId: string, analyzeRunId: string) {
  return {
    userId: USER_A, caseId, analyzeRunId, promptVersion: 'synthetic-test',
    resultSchemaVersion: 'kigen-analysis-result-v2', model: 'synthetic-no-provider',
    result: makeValidV2Result(), context: buildContextSnapshot({
      personProfile: null, userPatternSummary: null, recentCaseSummaries: [], recentFeedbacks: [],
    }), usedCaseIds: [], usedFeedbackIds: [], personProfileId: null, userPatternSummaryId: null,
  };
}
async function completedCase() {
  const analysisCase = await createCase();
  const started = await repository.startAnalysis(USER_A, analysisCase.id);
  assert.equal(started.kind, 'started');
  if (started.kind !== 'started') throw new Error('Synthetic case did not start.');
  const result = await repository.completeAnalysis(completion(analysisCase.id, started.analyzeRunId));
  assert.ok(result);
  return { analysisCase, result };
}

// Hold the real repository lock so both transactions demonstrably occupy separate
// PostgreSQL connections before allowing their normal SQL to continue.
async function concurrentlyBehindLock(key: string, tasks: (() => Promise<unknown>)[]) {
  const blocker = new pg.Client({ connectionString: databaseUrl });
  await blocker.connect();
  await blocker.query('BEGIN');
  await blocker.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [key]);
  const pending = Promise.allSettled(tasks.map(task => task()));
  let observed = false;
  try {
    const deadline = Date.now() + 2500;
    while (Date.now() < deadline) {
      const blocked = await blocker.query(
        `SELECT COUNT(DISTINCT l.pid)::int AS connections
         FROM pg_locks l
         WHERE l.locktype = 'advisory' AND NOT l.granted
           AND l.database = (SELECT oid FROM pg_database WHERE datname = current_database())`);
      if (blocked.rows[0].connections === 2) { observed = true; break; }
      await new Promise(resolveWait => setTimeout(resolveWait, 20));
    }
  } finally {
    await blocker.query('ROLLBACK');
    await blocker.end();
  }
  const results = await pending;
  assert.equal(observed, true, 'two separate DB connections must be concurrently waiting');
  return results;
}

test('owned repository reads and composite foreign keys reject user B', { timeout: 15_000 }, async () => {
  const analysisCase = await createCase();
  assert.equal(await repository.findOwnedCase(USER_B, analysisCase.id), null);
  assert.deepEqual(await repository.startAnalysis(USER_B, analysisCase.id), { kind: 'not_found' });
  await assert.rejects(createCase(USER_B, personA), (error: any) => error.code === 'P2003');
  assert.equal(await prisma.apiUsageEvent.count({ where: { userId: USER_B } }), 0);
});

test('two real connections start the same case only once', { timeout: 15_000 }, async () => {
  const analysisCase = await createCase();
  const results = await concurrentlyBehindLock('analysis-case:' + analysisCase.id, [
    () => repository.startAnalysis(USER_A, analysisCase.id),
    () => repository.startAnalysis(USER_A, analysisCase.id),
  ]);
  assert.ok(results.every(result => result.status === 'fulfilled'));
  const values = results.map(result => (result as PromiseFulfilledResult<any>).value);
  assert.deepEqual(values.map(value => value.kind).sort(), ['analyzing', 'started']);
  const state = await repository.findOwnedCase(USER_A, analysisCase.id);
  assert.equal(state?.analyzeAttemptCount, 1);
  assert.equal(state?.analyzeRunId, values.find(value => value.kind === 'started').analyzeRunId);
});

test('stale completion and failure cannot overwrite a newer run', { timeout: 15_000 }, async () => {
  const analysisCase = await createCase();
  const oldRun = await repository.startAnalysis(USER_A, analysisCase.id);
  assert.equal(oldRun.kind, 'started');
  if (oldRun.kind !== 'started') throw new Error('No initial run.');
  await repository.failAnalysis({ userId: USER_A, caseId: analysisCase.id,
    analyzeRunId: oldRun.analyzeRunId, failureCode: 'SYNTHETIC', failureMessage: 'Synthetic failure.' });
  const newRun = await repository.startAnalysis(USER_A, analysisCase.id);
  if (newRun.kind !== 'started') throw new Error('No replacement run.');
  assert.notEqual(newRun.analyzeRunId, oldRun.analyzeRunId);
  assert.equal(await repository.completeAnalysis(completion(analysisCase.id, oldRun.analyzeRunId)), null);
  assert.equal((await repository.failAnalysis({ userId: USER_A, caseId: analysisCase.id,
    analyzeRunId: oldRun.analyzeRunId, failureCode: 'SYNTHETIC', failureMessage: 'Stale failure.' })).count, 0);
  const saved = await repository.completeAnalysis(completion(analysisCase.id, newRun.analyzeRunId));
  assert.equal(saved?.version, 1);
  assert.equal(await repository.completeAnalysis(completion(analysisCase.id, newRun.analyzeRunId)), null);
  assert.equal(await prisma.analysisResult.count({ where: { analysisCaseId: analysisCase.id } }), 1);
  assert.equal((await repository.findOwnedCase(USER_A, analysisCase.id))?.status, 'analyzed');
});

test('result constraints enforce unique versions and transactional rollback', { timeout: 15_000 }, async () => {
  const analysisCase = await createCase();
  const started = await repository.startAnalysis(USER_A, analysisCase.id);
  if (started.kind !== 'started') throw new Error('No run.');
  await assert.rejects(repository.completeAnalysis({
    ...completion(analysisCase.id, started.analyzeRunId), promptVersion: '',
  }));
  assert.equal((await repository.findOwnedCase(USER_A, analysisCase.id))?.status, 'analyzing');
  assert.equal(await prisma.analysisResult.count({ where: { analysisCaseId: analysisCase.id } }), 0);
  const result = await repository.completeAnalysis(completion(analysisCase.id, started.analyzeRunId));
  assert.ok(result);
  const existing = await prisma.analysisResult.findUniqueOrThrow({ where: { id: result.id } });
  await assert.rejects(prisma.analysisResult.create({ data: {
    userId: USER_A, analysisCaseId: analysisCase.id,
    analyzeRunId: '44444444-4444-4444-8444-444444444444',
    version: 1, promptVersion: 'synthetic-test', resultSchemaVersion: 'synthetic',
    model: 'synthetic', resultJson: {},
  } }), (error: any) => error.code === 'P2002');
  await prisma.analysisResult.create({ data: {
    userId: USER_A, analysisCaseId: analysisCase.id,
    analyzeRunId: '55555555-5555-4555-8555-555555555555',
    version: 2, promptVersion: 'synthetic-test', resultSchemaVersion: 'synthetic',
    model: 'synthetic', resultJson: {}, createdAt: new Date('2020-01-01T00:00:00Z'),
  } });
  assert.equal((await repository.findLatestResult(USER_A, analysisCase.id))?.version, 2);
  assert.equal(await repository.findLatestResult(USER_B, analysisCase.id), null);
  assert.ok(existing.createdAt > new Date('2020-01-01T00:00:00Z'));
});

test('quota reservation is atomic across concurrent different cases', { timeout: 15_000 }, async () => {
  const policyKey = 'synthetic-quota-test';
  await prisma.rateLimitPolicy.create({ data: {
    policyKey, subjectType: 'user', routeKey: 'analyze', windowType: 'rolling',
    windowSeconds: 3600, maxRequests: 1, maxCostUnits: 3,
  } });
  const cases = await Promise.all([createCase(USER_QUOTA, personQuota), createCase(USER_QUOTA, personQuota)]);
  const results = await concurrentlyBehindLock(policyKey + ':user:' + USER_QUOTA,
    cases.map(analysisCase => () => repository.startAnalysis(USER_QUOTA, analysisCase.id)));
  const successes = results.filter(result => result.status === 'fulfilled') as PromiseFulfilledResult<any>[];
  const failures = results.filter(result => result.status === 'rejected') as PromiseRejectedResult[];
  assert.equal(successes.length, 1);
  assert.equal(successes[0].value.kind, 'started');
  assert.equal(failures.length, 1);
  assert.equal(failures[0].reason.code, 'AI_RATE_LIMITED');
  assert.equal(await prisma.apiUsageEvent.count({ where: { userId: USER_QUOTA } }), 1);
  assert.equal(await prisma.analysisCase.count({ where: { userId: USER_QUOTA, status: 'draft', analyzeAttemptCount: 0 } }), 1);
  await prisma.rateLimitPolicy.update({ where: { policyKey }, data: { isEnabled: false } });
});

test('Feedback API rolls back real writes and retry succeeds after auxiliary failure', { timeout: 15_000 }, async (t) => {
  const { result, analysisCase } = await completedCase();
  await prisma.userPrivacySetting.upsert({
    where: { userId: USER_A }, create: { userId: USER_A }, update: { personalizationEnabled: true, useFeedbackForContext: true },
  });
  await prisma.personProfile.create({ data: {
    userId: USER_A, personId: personA, profileSchemaVersion: 'synthetic', profileJson: {},
  } });
  const [{ createServerApp }, { supabaseAuth }] = await Promise.all([
    import('../../src/backend/server.js'), import('../../src/backend/auth/supabase.js'),
  ]);
  t.mock.method(supabaseAuth.auth, 'getUser', async () => ({
    data: { user: { id: USER_A, email: 'synthetic@example.invalid' } }, error: null,
  }));
  const server = (await createServerApp()).listen(0, '127.0.0.1');
  await new Promise<void>((resolveReady, reject) => {
    server.once('listening', resolveReady); server.once('error', reject);
  });
  const address = server.address() as { port: number };
  const baseUrl = 'http://127.0.0.1:' + address.port;
  const request = async (path: string, method: string, body: unknown) => {
    const response = await fetch(baseUrl + path, {
      method, headers: { authorization: 'Bearer synthetic-token', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() as any };
  };
  const installFailure = () => setup.query(`
    CREATE OR REPLACE FUNCTION synthetic_stale_failure() RETURNS trigger LANGUAGE plpgsql
      AS $$ BEGIN RAISE EXCEPTION 'synthetic auxiliary failure'; END $$;
    CREATE TRIGGER synthetic_fail_profile BEFORE UPDATE ON person_profiles
      FOR EACH ROW EXECUTE FUNCTION synthetic_stale_failure();`);
  const clearFailure = () => setup.query('DROP TRIGGER synthetic_fail_profile ON person_profiles');
  try {
    await installFailure();
    const body = { outcomeNote: 'Synthetic feedback.', allowPersonalizationUse: true };
    const path = '/api/analysis-results/' + result.id + '/feedback';
    const failed = await request(path, 'POST', body);
    assert.equal(failed.status, 500);
    assert.equal(JSON.stringify(failed.body).includes('synthetic auxiliary failure'), false);
    assert.equal(await prisma.analysisFeedback.count({ where: { analysisResultId: result.id } }), 0);
    await clearFailure();
    const retried = await request(path, 'POST', body);
    assert.equal(retried.status, 201);
    const feedbackId = retried.body.feedback.id;
    assert.equal((await prisma.personProfile.findUnique({ where: { personId: personA } }))?.needsRefresh, true);
    await prisma.personProfile.update({ where: { personId: personA }, data: { needsRefresh: false, staleSince: null } });
    await prisma.userPrivacySetting.update({ where: { userId: USER_A }, data: { personalizationEnabled: false } });
    await installFailure();
    const failedPatch = await request('/api/analysis-feedbacks/' + feedbackId, 'PATCH',
      { outcomeNote: 'Synthetic correction.', allowPersonalizationUse: false });
    assert.equal(failedPatch.status, 500);
    const unchanged = await prisma.analysisFeedback.findUnique({ where: { id: feedbackId } });
    assert.equal(unchanged?.outcomeNote, body.outcomeNote);
    assert.equal(unchanged?.allowPersonalizationUse, true);
    await clearFailure();
    assert.equal((await request('/api/analysis-feedbacks/' + feedbackId, 'PATCH',
      { allowPersonalizationUse: false })).status, 200);
    assert.equal((await prisma.analysisFeedback.findUnique({ where: { id: feedbackId } }))?.allowPersonalizationUse, false);
    assert.equal((await prisma.personProfile.findUnique({ where: { personId: personA } }))?.needsRefresh, true);
    await prisma.userPrivacySetting.update({ where: { userId: USER_A },
      data: { personalizationEnabled: true, useFeedbackForContext: true, usePersonProfile: false } });
    const { buildAiContext } = await import('../../src/backend/v17/context.repository.js');
    const context = await buildAiContext(USER_A, analysisCase.id);
    assert.ok(context);
    assert.deepEqual(context.aiInput.referenceContext.recentFeedbacks, []);
    assert.deepEqual(context.usedFeedbackIds, []);
  } finally {
    await setup.query('DROP TRIGGER IF EXISTS synthetic_fail_profile ON person_profiles');
    await new Promise<void>((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()));
  }
});


test('stale recovery locks the exact owned run and old responses cannot overwrite a replacement', { timeout: 15_000 }, async () => {
  const analysisCase = await createCase();
  const oldRun = await repository.startAnalysis(USER_A, analysisCase.id);
  if (oldRun.kind !== 'started') throw new Error('No stale fixture run.');
  const syntheticStart = new Date('2020-01-01T00:00:00Z');
  const syntheticCutoff = new Date('2021-01-01T00:00:00Z');
  await prisma.analysisCase.update({ where: { id: analysisCase.id }, data: { analyzeStartedAt: syntheticStart } });
  const recovery = { userId: USER_A, caseId: analysisCase.id, analyzeRunId: oldRun.analyzeRunId, cutoff: syntheticCutoff };
  assert.equal((await repository.recoverStaleAnalysis({ ...recovery, userId: USER_B })).count, 0);
  assert.equal((await repository.recoverStaleAnalysis({ ...recovery, cutoff: syntheticStart })).count, 0);
  const results = await concurrentlyBehindLock('analysis-case:' + analysisCase.id, [
    () => repository.recoverStaleAnalysis(recovery),
    () => repository.recoverStaleAnalysis(recovery),
  ]);
  assert.ok(results.every(result => result.status === 'fulfilled'));
  assert.deepEqual(results.map(result => (result as PromiseFulfilledResult<{ count: number }>).value.count).sort(), [0, 1]);
  const recovered = await repository.findOwnedCase(USER_A, analysisCase.id);
  assert.equal(recovered?.status, 'failed');
  assert.equal(recovered?.failureCode, 'ANALYSIS_STALE');
  assert.equal(recovered?.analyzeRunId, oldRun.analyzeRunId);
  assert.equal(await repository.completeAnalysis(completion(analysisCase.id, oldRun.analyzeRunId)), null);
  const newRun = await repository.startAnalysis(USER_A, analysisCase.id);
  if (newRun.kind !== 'started') throw new Error('No replacement after recovery.');
  assert.notEqual(newRun.analyzeRunId, oldRun.analyzeRunId);
  // Make the replacement equally old to isolate run identity from timestamp protection.
  await prisma.analysisCase.update({ where: { id: analysisCase.id }, data: { analyzeStartedAt: syntheticStart } });
  assert.equal((await repository.recoverStaleAnalysis(recovery)).count, 0);
  assert.equal((await repository.findOwnedCase(USER_A, analysisCase.id))?.status, 'analyzing');
  assert.equal((await repository.findOwnedCase(USER_A, analysisCase.id))?.analyzeRunId, newRun.analyzeRunId);
  assert.equal(await repository.completeAnalysis(completion(analysisCase.id, oldRun.analyzeRunId)), null);
  assert.equal((await repository.failAnalysis({ userId: USER_A, caseId: analysisCase.id,
    analyzeRunId: oldRun.analyzeRunId, failureCode: 'SYNTHETIC', failureMessage: 'Old fixture failure.' })).count, 0);
  assert.equal((await repository.completeAnalysis(completion(analysisCase.id, newRun.analyzeRunId)))?.version, 1);
  assert.equal((await repository.recoverStaleAnalysis({ ...recovery, analyzeRunId: newRun.analyzeRunId })).count, 0);
  assert.equal((await repository.findOwnedCase(USER_A, analysisCase.id))?.status, 'analyzed');
  assert.equal(await prisma.analysisResult.count({ where: { analysisCaseId: analysisCase.id } }), 1);
});

test('usage linkage is atomic and settlement targets the immutable owned run', { timeout: 15_000 }, async () => {
  const analysisCase = await createCase();
  // A reservation INSERT failure must roll back the preceding case start too.
  await setup.query(`CREATE FUNCTION synthetic_usage_failure() RETURNS trigger LANGUAGE plpgsql
    AS $$ BEGIN RAISE EXCEPTION 'synthetic reservation failure'; END $$;
    CREATE TRIGGER synthetic_fail_usage BEFORE INSERT ON api_usage_events
      FOR EACH ROW EXECUTE FUNCTION synthetic_usage_failure();`);
  try {
    await assert.rejects(repository.startAnalysis(USER_A, analysisCase.id));
    const state = await repository.findOwnedCase(USER_A, analysisCase.id);
    assert.equal(state?.status, 'draft');
    assert.equal(state?.analyzeRunId, null);
    assert.equal(state?.analyzeAttemptCount, 0);
    assert.equal(await prisma.apiUsageEvent.count({ where: { analysisCaseId: analysisCase.id } }), 0);
  } finally { await setup.query('DROP TRIGGER synthetic_fail_usage ON api_usage_events'); }
  const oldRun = await repository.startAnalysis(USER_A, analysisCase.id);
  if (oldRun.kind !== 'started') throw new Error('No linked reservation.');
  const identity = { userId: USER_A, usageEventId: oldRun.usageEventId,
    analysisCaseId: analysisCase.id, analyzeRunId: oldRun.analyzeRunId };
  const event = await prisma.apiUsageEvent.findUnique({ where: { id: oldRun.usageEventId } });
  assert.equal(event?.analysisCaseId, analysisCase.id);
  assert.equal(event?.analyzeRunId, oldRun.analyzeRunId);
  assert.equal(event?.costUnits, 3);
  assert.equal(await settleUsage(prisma, { ...identity, userId: USER_B }, 'failed', 0), 'unmatched');
  assert.equal(await settleUsage(prisma, { ...identity, analyzeRunId: USER_B }, 'failed', 0), 'unmatched');
  await repository.failAnalysis({ userId: USER_A, caseId: analysisCase.id,
    analyzeRunId: oldRun.analyzeRunId, failureCode: 'SYNTHETIC', failureMessage: 'Synthetic fixture.' });
  const newRun = await repository.startAnalysis(USER_A, analysisCase.id);
  if (newRun.kind !== 'started') throw new Error('No replacement reservation.');
  assert.notEqual(newRun.analyzeRunId, oldRun.analyzeRunId);
  // The current run changed. Settlement must still match only the original event/run.
  const outcomes = await Promise.all([settleUsage(prisma, identity, 'failed', 2), settleUsage(prisma, identity, 'failed', 2)]);
  assert.deepEqual(outcomes.sort(), ['already_settled', 'settled']);
  assert.equal(await settleUsage(prisma, identity, 'succeeded', 1), 'conflict');
  assert.equal((await prisma.apiUsageEvent.findUnique({ where: { id: newRun.usageEventId } }))?.costUnits, 3);
  assert.equal((await prisma.apiUsageEvent.findUnique({ where: { id: newRun.usageEventId } }))?.status, 'allowed');
  assert.equal((await prisma.apiUsageEvent.findUnique({ where: { id: oldRun.usageEventId } }))?.costUnits, 2);
  const legacy = await prisma.apiUsageEvent.create({ data: { userId: USER_A, routeKey: 'analyze', costUnits: 3, status: 'allowed' } });
  assert.equal(await settleUsage(prisma, { ...identity, usageEventId: legacy.id }, 'failed', 0), 'unmatched');
  assert.equal((await prisma.apiUsageEvent.findUnique({ where: { id: legacy.id } }))?.costUnits, 3);
  await assert.rejects(prisma.apiUsageEvent.create({ data: { userId: USER_A,
    routeKey: 'analyze', analysisCaseId: analysisCase.id, costUnits: 3, status: 'allowed' } }));
  // Preserve existing ON DELETE SET NULL retention without cascading usage through new IDs.
  const disposableUser = '99999999-9999-4999-8999-999999999999';
  await setup.query('INSERT INTO auth.users(id) VALUES ($1)', [disposableUser]);
  const retained = await prisma.apiUsageEvent.create({ data: { userId: disposableUser,
    routeKey: 'analyze', analysisCaseId: analysisCase.id, analyzeRunId: oldRun.analyzeRunId, costUnits: 3, status: 'allowed' } });
  await setup.query('DELETE FROM auth.users WHERE id = $1', [disposableUser]);
  assert.equal((await prisma.apiUsageEvent.findUnique({ where: { id: retained.id } }))?.userId, null);
  assert.equal(await settleUsage(prisma, { ...identity, userId: disposableUser, usageEventId: retained.id }, 'failed', 0), 'unmatched');
});
