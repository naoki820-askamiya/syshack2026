import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { before, after } from 'node:test';
import pg from 'pg';
import { createHash, randomUUID } from 'node:crypto';
import type { GuestPolicy, GuestRepository, GuestRun } from '../../src/backend/guest/types.js';
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

function atomicInput(displayName: string, createIntentKey = randomUUID()) {
  return { newPerson: { displayName, relationshipType: 'friend' as const }, createIntentKey,
    userAgeRange: 'unknown', userGender: 'unknown', perceivedPartnerReaction: 'unknown', elapsedTimeType: 'unknown',
    eventFacts: 'Synthetic atomic consultation', userResponseType: 'none' as const, userResponseText: null };
}
const [{ PrismaClient }, { PrismaPg }] = await Promise.all([
  import('../../src/backend/generated/prisma/client.js'), import('@prisma/adapter-pg'),
]);
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl, max: 2 }) });
(globalThis as typeof globalThis & { prisma?: unknown }).prisma = prisma;
const repository = await import('../../src/backend/v17/workflow.repository.js');
const { settleUsage } = await import('../../src/backend/v17/rateLimit.js');
const persons = await import('../../src/backend/v17/persons.repository.js');
const setup = new pg.Client({ connectionString: databaseUrl });
let personA: string;
let personQuota: string;

test('combined creation on two real connections commits exactly one Person+Case and replays after lost ACK', { timeout: 15_000 }, async () => {
  const input = atomicInput('Synthetic atomic parallel');
  let saved: any;
  await withIntentInsertLock('analysis_cases', async lock => {
    const outcomes = await concurrentlyBehindLock(lock, [
      () => repository.createCaseWithNewPerson(USER_A, input),
      () => repository.createCaseWithNewPerson(USER_A, input),
    ]);
    assert.ok(outcomes.every(result => result.status === 'fulfilled'), 'both same-key callers must receive the committed pair');
    saved = (outcomes[0] as PromiseFulfilledResult<any>).value;
    assert.equal((outcomes[1] as PromiseFulfilledResult<any>).value.id, saved.id);
    assert.equal((outcomes[1] as PromiseFulfilledResult<any>).value.personId, saved.personId);
  });
  assert.equal(await prisma.person.count({ where: { userId: USER_A, displayName: input.newPerson.displayName } }), 1);
  assert.equal(await prisma.analysisCase.count({ where: { userId: USER_A, createIntentKey: input.createIntentKey } }), 1);
  const snapshot = saved.personSnapshot;
  await persons.updateOwnedPerson(USER_A, saved.personId, { displayName: 'Synthetic later edit' });
  const replay = await repository.createCaseWithNewPerson(USER_A, input);
  assert.equal(replay.id, saved.id); assert.deepEqual(replay.personSnapshot, snapshot);
  await assert.rejects(repository.createCaseWithNewPerson(USER_A, { ...input, eventFacts: 'Changed input' }), (e: any) => e.status === 409);
  await assert.rejects(repository.createCaseWithNewPerson(USER_A, { ...input, newPerson: { ...input.newPerson, displayName: 'Changed Person' } }), (e: any) => e.status === 409);
  assert.equal(await prisma.person.count({ where: { userId: USER_A, displayName: 'Changed Person' } }), 0);
  const other = await repository.createCaseWithNewPerson(USER_B, input);
  assert.notEqual(other.id, saved.id); assert.notEqual(other.personId, saved.personId);
  await persons.archiveOwnedPerson(USER_A, saved.personId);
  await assert.rejects(repository.createCaseWithNewPerson(USER_A, input), (e: any) => e.status === 404);
});

test('real PostgreSQL Person or Case insert failure leaves neither row; unchanged retry succeeds', { timeout: 15_000 }, async () => {
  for (const table of ['persons', 'analysis_cases']) {
    const input = atomicInput('Synthetic atomic rollback ' + table);
    await setup.query(`CREATE FUNCTION synthetic_atomic_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic atomic failure'; END $$;
      CREATE TRIGGER synthetic_atomic_failure AFTER INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION synthetic_atomic_failure();`);
    try {
      await assert.rejects(repository.createCaseWithNewPerson(USER_A, input));
      assert.equal(await prisma.person.count({ where: { userId: USER_A, displayName: input.newPerson.displayName } }), 0);
      assert.equal(await prisma.analysisCase.count({ where: { userId: USER_A, createIntentKey: input.createIntentKey } }), 0);
    } finally {
      await setup.query(`DROP TRIGGER synthetic_atomic_failure ON ${table}; DROP FUNCTION synthetic_atomic_failure()`);
    }
    const saved = await repository.createCaseWithNewPerson(USER_A, input);
    assert.equal(await prisma.person.count({ where: { userId: USER_A, id: saved.personId } }), 1);
    assert.equal(await prisma.analysisCase.count({ where: { userId: USER_A, createIntentKey: input.createIntentKey } }), 1);
  }
});

test('concurrent different contents under one key yield one pair and one409; foreign Person is rejected', { timeout: 15_000 }, async () => {
  const input = atomicInput('Synthetic atomic race A');
  const changed = { ...input, newPerson: { ...input.newPerson, displayName: 'Synthetic atomic race B' } };
  await withIntentInsertLock('analysis_cases', async lock => {
    const outcomes = await concurrentlyBehindLock(lock, [
      () => repository.createCaseWithNewPerson(USER_A, input),
      () => repository.createCaseWithNewPerson(USER_A, changed),
    ]);
    assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1);
    const rejected = outcomes.find(outcome => outcome.status === 'rejected') as PromiseRejectedResult;
    assert.equal(rejected.reason.status, 409); assert.equal(rejected.reason.code, 'CREATE_INTENT_CONFLICT');
  });
  assert.equal(await prisma.person.count({ where: { userId: USER_A, displayName: { in: [input.newPerson.displayName, changed.newPerson.displayName] } } }), 1);
  assert.equal(await prisma.analysisCase.count({ where: { userId: USER_A, createIntentKey: input.createIntentKey } }), 1);
  const foreign = await persons.createPerson(USER_B, { displayName: 'Synthetic foreign atomic target', relationshipType: 'friend' });
  const { newPerson: _newPerson, ...fields } = atomicInput('Unused new Person');
  await assert.rejects(repository.createCase(USER_A, { ...fields, personId: foreign.id }), (e: any) => e.status === 404);
  assert.equal(await prisma.analysisCase.count({ where: { userId: USER_A, createIntentKey: fields.createIntentKey } }), 0);
});

test('existing-person and combined intent namespaces conflict safely in either order', { timeout: 15_000 }, async () => {
  const combined = atomicInput('Synthetic atomic namespace');
  const saved = await repository.createCaseWithNewPerson(USER_A, combined);
  const { newPerson: _newPerson, ...fields } = combined;
  await assert.rejects(repository.createCase(USER_A, { ...fields, personId: saved.personId }), (e: any) => e.status === 409);
  const legacy = { ...fields, createIntentKey: randomUUID(), personId: personA };
  await repository.createCase(USER_A, legacy);
  const next = { ...combined, createIntentKey: legacy.createIntentKey, newPerson: { ...combined.newPerson, displayName: 'Synthetic namespace losing Person' } };
  await assert.rejects(repository.createCaseWithNewPerson(USER_A, next), (e: any) => e.status === 409);
  assert.equal(await prisma.person.count({ where: { userId: USER_A, displayName: next.newPerson.displayName } }), 0);
});

test('analysis generation failure retains the committed pair and combined replay does not restart analysis', { timeout: 15_000 }, async () => {
  const input = atomicInput('Synthetic atomic analysis failure');
  const saved = await repository.createCaseWithNewPerson(USER_A, input);
  const service = await import('../../src/backend/v17/workflow.service.js');
  let attempts = 0;
  await assert.rejects(service.analyzeCase(USER_A, saved.id, { generate: async () => { attempts++; throw new Error('Synthetic provider failure'); } }));
  assert.equal(attempts, 1);
  const failed = await repository.findOwnedCase(USER_A, saved.id);
  assert.equal(failed?.status, 'failed');
  const usage = await prisma.apiUsageEvent.count({ where: { analysisCaseId: saved.id } });
  const replay = await repository.createCaseWithNewPerson(USER_A, input);
  assert.equal(replay.id, saved.id); assert.equal(replay.status, 'failed');
  assert.equal(await prisma.apiUsageEvent.count({ where: { analysisCaseId: saved.id } }), usage);
  assert.equal(await prisma.person.count({ where: { userId: USER_A, id: saved.personId } }), 1);
});

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

async function withIntentInsertLock(table: 'persons' | 'analysis_cases', body: (lock: string) => Promise<void>) {
  const lock = 'synthetic-intent-' + table;
  await setup.query(`CREATE FUNCTION synthetic_intent_lock() RETURNS trigger LANGUAGE plpgsql
    AS $$ BEGIN IF NEW.create_intent_key IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended('${lock}', 0)); END IF; RETURN NEW; END $$;
    CREATE TRIGGER synthetic_intent_lock BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION synthetic_intent_lock();`);
  try { await body(lock); } finally { await setup.query(`DROP TRIGGER synthetic_intent_lock ON ${table}; DROP FUNCTION synthetic_intent_lock()`); }
}

test('Person create intents serialize real parallel connections and replay current resource', { timeout: 15_000 }, async () => {
  const key = randomUUID();
  const input = { displayName: 'Synthetic retry person', relationshipType: 'friend' as const, createIntentKey: key };
  let person: any;
  await withIntentInsertLock('persons', async lock => {
    const outcomes = await concurrentlyBehindLock(lock, [() => persons.createPerson(USER_A, input), () => persons.createPerson(USER_A, input)]);
    assert.ok(outcomes.every(result => result.status === 'fulfilled'), JSON.stringify(outcomes.map(result => result.status === 'fulfilled' ? { status: result.status } : { status: result.status, code: result.reason.code, meta: result.reason.meta })));
    person = (outcomes[0] as PromiseFulfilledResult<any>).value;
    assert.equal((outcomes[1] as PromiseFulfilledResult<any>).value.id, person.id);
  });
  assert.equal(await prisma.person.count({ where: { userId: USER_A, createIntentKey: key } }), 1);
  assert.equal((await persons.createPerson(USER_A, input)).id, person.id); // committed response was lost
  await assert.rejects(persons.createPerson(USER_A, { ...input, displayName: 'Different intent payload' }), (e: any) => e.status === 409 && e.code === 'CREATE_INTENT_CONFLICT');
  assert.notEqual((await persons.createPerson(USER_A, { ...input, createIntentKey: randomUUID() })).id, person.id);
  assert.notEqual((await persons.createPerson(USER_B, input)).id, person.id);
  const { createIntentKey: _key, ...legacy } = input;
  assert.notEqual((await persons.createPerson(USER_A, legacy)).id, (await persons.createPerson(USER_A, legacy)).id);
  await persons.updateOwnedPerson(USER_A, person.id, { displayName: 'Explicit edit', relationshipType: 'coworker' });
  const replay = await persons.createPerson(USER_A, { ...input, notes: null });
  assert.equal(replay.displayName, 'Explicit edit'); assert.equal(replay.createIntentFingerprint, person.createIntentFingerprint);
  await persons.archiveOwnedPerson(USER_A, person.id);
  await assert.rejects(persons.createPerson(USER_A, input), (e: any) => e.status === 404);
  assert.equal(await prisma.person.count({ where: { userId: USER_A, createIntentKey: key } }), 1);
  await assert.rejects(prisma.person.create({ data: { userId: USER_A, displayName: 'Invalid pair', relationshipType: 'friend', createIntentKey: randomUUID() } }));
});

test('Case create intents preserve analyzed run/result/quota/snapshot and reject archived replay', { timeout: 15_000 }, async () => {
  const person = await persons.createPerson(USER_A, { displayName: 'Intent case Person', relationshipType: 'friend' });
  const input = { personId: person.id, userAgeRange: 'unknown', userGender: 'unknown', perceivedPartnerReaction: 'unknown',
    elapsedTimeType: 'unknown', eventFacts: 'Synthetic uncertain Case commit', userResponseType: 'none', userResponseText: null, createIntentKey: randomUUID() };
  let analysisCase: any;
  await withIntentInsertLock('analysis_cases', async lock => {
    const outcomes = await concurrentlyBehindLock(lock, [() => repository.createCase(USER_A, input), () => repository.createCase(USER_A, input)]);
    assert.ok(outcomes.every(result => result.status === 'fulfilled'), JSON.stringify(outcomes.map(result => result.status === 'fulfilled' ? { status: result.status } : { status: result.status, code: result.reason.code, meta: result.reason.meta })));
    analysisCase = (outcomes[0] as PromiseFulfilledResult<any>).value;
    assert.equal((outcomes[1] as PromiseFulfilledResult<any>).value.id, analysisCase.id);
  });
  assert.equal(await prisma.analysisCase.count({ where: { userId: USER_A, createIntentKey: input.createIntentKey } }), 1);
  const started = await repository.startAnalysis(USER_A, analysisCase.id);
  if (started.kind !== 'started') throw new Error('Synthetic analysis not started');
  await repository.completeAnalysis(completion(analysisCase.id, started.analyzeRunId));
  const before = await repository.findOwnedCase(USER_A, analysisCase.id);
  const quotaBefore = await prisma.apiUsageEvent.count({ where: { analysisCaseId: analysisCase.id } });
  await persons.updateOwnedPerson(USER_A, person.id, { displayName: 'Later person edit' });
  const replay = await repository.createCase(USER_A, input);
  assert.deepEqual(replay, before);
  assert.deepEqual(replay.personSnapshot, analysisCase.personSnapshot);
  assert.equal(await prisma.apiUsageEvent.count({ where: { analysisCaseId: analysisCase.id } }), quotaBefore);
  assert.equal(await prisma.analysisResult.count({ where: { analysisCaseId: analysisCase.id } }), 1);
  await assert.rejects(repository.createCase(USER_A, { ...input, eventFacts: 'Different payload' }), (e: any) => e.status === 409);
  assert.notEqual((await repository.createCase(USER_A, { ...input, createIntentKey: randomUUID() })).id, analysisCase.id);
  const foreign = await persons.createPerson(USER_B, { displayName: 'Foreign intent', relationshipType: 'friend' });
  assert.notEqual((await repository.createCase(USER_B, { ...input, personId: foreign.id })).id, analysisCase.id);
  await assert.rejects(repository.createCase(USER_B, input), (e: any) => e.status === 404);
  await persons.archiveOwnedPerson(USER_A, person.id);
  await assert.rejects(repository.createCase(USER_A, input), (e: any) => e.status === 404);
  assert.equal(await prisma.analysisCase.count({ where: { userId: USER_A, createIntentKey: input.createIntentKey } }), 1);
});

test('failed insert rolls back resource and creation intent together so unchanged retry succeeds', { timeout: 15_000 }, async () => {
  const personInput = { displayName: 'Rollback Person', relationshipType: 'friend' as const, createIntentKey: randomUUID() };
  const caseInput = { personId: personA, userAgeRange: 'unknown', userGender: 'unknown', perceivedPartnerReaction: 'unknown',
    elapsedTimeType: 'unknown', eventFacts: 'Synthetic rollback Case', userResponseType: 'none', userResponseText: null, createIntentKey: randomUUID() };
  for (const table of ['persons', 'analysis_cases'] as const) {
    const input = table === 'persons' ? personInput : caseInput;
    const operation = () => table === 'persons' ? persons.createPerson(USER_A, personInput) : repository.createCase(USER_A, caseInput);
    await setup.query(`CREATE FUNCTION synthetic_intent_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic intent rollback'; END $$;
      CREATE TRIGGER synthetic_intent_failure AFTER INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION synthetic_intent_failure();`);
    try { await assert.rejects(operation()); } finally { await setup.query(`DROP TRIGGER synthetic_intent_failure ON ${table}; DROP FUNCTION synthetic_intent_failure()`); }
    const count = await setup.query(`SELECT count(*)::int AS n FROM ${table} WHERE user_id=$1 AND create_intent_key=$2`, [USER_A, input.createIntentKey]);
    assert.equal(count.rows[0].n, 0); assert.ok((await operation()).id);
  }
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
  await assert.rejects(createCase(USER_B, personA), (error: any) => error.code === 'RESOURCE_NOT_FOUND');
  // The database owner/person composite FK remains a second independent boundary.
  await assert.rejects(prisma.analysisCase.create({ data: { userId: USER_B, personId: personA,
    userAgeRange: 'unknown', userGender: 'unknown', perceivedPartnerReaction: 'unknown', elapsedTimeType: 'unknown',
    eventFacts: 'Synthetic foreign ownership', userResponseType: 'none', personSnapshot: {
      schemaVersion: 'person-snapshot-v1', capturedAt: '2026-10-05T00:00:00Z',
      person: { displayName: 'Synthetic person', relationshipType: 'coworker' },
    } } }),
  (error: any) => error.code === 'P2003');
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

test('Person edit and Profile invalidation roll back together and leave old snapshots intact', { timeout: 15_000 }, async () => {
  const person = await prisma.person.create({ data: { userId: USER_A, displayName: 'Original', relationshipType: 'coworker' } });
  const oldCase = await createCase(USER_A, person.id);
  await prisma.personProfile.create({ data: { userId: USER_A, personId: person.id, profileSchemaVersion: 'synthetic', profileJson: {} } });
  await prisma.userPrivacySetting.upsert({ where: { userId: USER_A }, create: { userId: USER_A, personalizationEnabled: false }, update: { personalizationEnabled: false } });
  await setup.query(`CREATE FUNCTION synthetic_person_edit_failure() RETURNS trigger LANGUAGE plpgsql
    AS $$ BEGIN RAISE EXCEPTION 'synthetic edit invalidation failure'; END $$;
    CREATE TRIGGER synthetic_fail_person_edit BEFORE UPDATE ON person_profiles
    FOR EACH ROW EXECUTE FUNCTION synthetic_person_edit_failure();`);
  try {
    await assert.rejects(persons.updateOwnedPerson(USER_A, person.id, { displayName: 'Edited', relationshipType: 'friend' }));
    assert.equal((await persons.findOwnedPerson(USER_A, person.id))?.displayName, 'Original');
    assert.equal((await prisma.personProfile.findUnique({ where: { personId: person.id } }))?.needsRefresh, false);
  } finally { await setup.query('DROP TRIGGER synthetic_fail_person_edit ON person_profiles; DROP FUNCTION synthetic_person_edit_failure()'); }
  assert.equal(await persons.updateOwnedPerson(USER_B, person.id, { displayName: 'Foreign' }), null);
  const edited = await persons.updateOwnedPerson(USER_A, person.id, { displayName: 'Edited', relationshipType: 'friend' });
  assert.equal(edited?.displayName, 'Edited');
  const profile = await prisma.personProfile.findUnique({ where: { personId: person.id } });
  assert.equal(profile?.needsRefresh, true); assert.ok(profile?.staleSince);
  assert.deepEqual((await repository.findOwnedCase(USER_A, oldCase.id))?.personSnapshot, oldCase.personSnapshot);
  const nextCase = await createCase(USER_A, person.id);
  assert.deepEqual((nextCase.personSnapshot as any).person, { displayName: 'Edited', relationshipType: 'friend' });
  assert.deepEqual((oldCase.personSnapshot as any).person, { displayName: 'Original', relationshipType: 'coworker' });
  await prisma.userPrivacySetting.update({ where: { userId: USER_A }, data: { personalizationEnabled: true, usePersonProfile: true } });
  const { buildAiContext } = await import('../../src/backend/v17/context.repository.js');
  assert.equal((await buildAiContext(USER_A, nextCase.id))?.personProfileId, null);
});

for (const archived of [false, true]) test('Case snapshot waits for concurrent Person ' + (archived ? 'archive' : 'edit'), { timeout: 15_000 }, async () => {
  const person = await prisma.person.create({ data: { userId: USER_A, displayName: 'Before lock', relationshipType: 'coworker' } });
  const blocker = new pg.Client({ connectionString: databaseUrl });
  await blocker.connect(); await blocker.query('BEGIN');
  await blocker.query(archived ? 'UPDATE persons SET archived_at = now() WHERE id = $1' :
    "UPDATE persons SET display_name = 'Committed edit', relationship_type = 'friend' WHERE id = $1", [person.id]);
  const pending = Promise.allSettled([createCase(USER_A, person.id)]);
  let observed = false;
  try {
    const deadline = Date.now() + 2500;
    while (Date.now() < deadline) {
      // Fresh autocommit observer avoids a transaction-cached pg_stat_activity snapshot.
      const waiting = await setup.query(`SELECT COUNT(DISTINCT l.pid)::int AS connections FROM pg_locks l
        JOIN pg_stat_activity a ON a.pid = l.pid WHERE l.locktype = 'transactionid' AND NOT l.granted
        AND a.datname = current_database()`);
      if (waiting.rows[0].connections > 0) { observed = true; break; }
      await new Promise(resolveWait => setTimeout(resolveWait, 20));
    }
  } finally { await blocker.query('COMMIT'); await blocker.end(); }
  const [outcome] = await pending;
  assert.equal(observed, true, 'production createCase must wait for the Person row change');
  if (archived) {
    assert.equal(outcome.status, 'rejected');
    assert.equal((outcome as PromiseRejectedResult).reason.code, 'RESOURCE_NOT_FOUND');
    assert.equal(await prisma.analysisCase.count({ where: { personId: person.id } }), 0);
  } else {
    assert.equal(outcome.status, 'fulfilled');
    assert.deepEqual(((outcome as PromiseFulfilledResult<any>).value.personSnapshot as any).person,
      { displayName: 'Committed edit', relationshipType: 'friend' });
  }
});

// These tests are deliberately part of the guarded disposable PostgreSQL suite,
// not npm test: they exercise the production SQL after all migrations above.
// Synthetic policy values are fixtures, not approved prices or operating limits.
const guestPolicy: GuestPolicy = {
  model: 'synthetic-no-provider', pricingVersion: 'synthetic-price-v1',
  tokenBoundVersion: 'synthetic-token-bound-v1', inputTokenBound: 100, maxOutputTokens: 50,
  maxCostMicros: '100', promptVersion: 'synthetic-prompt', schemaVersion: 'synthetic-schema',
  termsVersion: 'synthetic-terms', privacyVersion: 'synthetic-privacy', consentVersion: 'synthetic-consent',
  contentTtlMs: 86_400_000, usedTtlMs: 30 * 86_400_000,
};
const guestInput = { eventFacts: 'Synthetic guest input; no real consultation or provider.' };
const guestFingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

async function guestRepository(db = prisma): Promise<GuestRepository> {
  return (await import('../../src/backend/guest/repository.js')).createGuestRepository(db);
}

async function resetGuestBudget(limits: { cost?: string; requests?: number; concurrent?: number } = {}) {
  // before() proves the database identity; only these synthetic guest fixtures
  // are removed. No Compose stack, shared database or production URL is used.
  await setup.query('DELETE FROM guest_v1_receipts; DELETE FROM guest_v1_runs; DELETE FROM guest_v1_sessions');
  await setup.query(`UPDATE guest_v1_budget SET stopped=false, max_cost_micros=$1,
    max_requests=$2, max_concurrent=$3, issuance_limit=10000,
    issue_window_seconds=3600, issue_window_limit=10000,
    occupied_micros=0, occupied_requests=0, active_runs=0, issued_total=0
    WHERE scope='guest-v1'`, [limits.cost ?? '1000000', limits.requests ?? 1000, limits.concurrent ?? 100]);
}

async function consentedGuest(repo: GuestRepository, policy = guestPolicy) {
  const tokenHash = guestFingerprint(randomUUID());
  const session = await repo.issue(tokenHash, new Date(Date.now() + 60_000));
  return repo.consent(session.id, policy);
}

async function reservedGuest(repo: GuestRepository, policy = guestPolicy) {
  const session = await consentedGuest(repo, policy);
  const executor = randomUUID();
  const { run } = await repo.reserve(session.id, randomUUID(), guestFingerprint(guestInput), guestInput, policy, executor);
  return { session, run, executor };
}

async function assertGuestBudget(repo: GuestRepository, cost: string, requests: number, active: number) {
  const budget = await repo.budget();
  assert.equal(budget.occupiedMicros, cost);
  assert.equal(budget.occupiedRequests, requests);
  assert.equal(budget.activeRuns, active);
  return budget;
}

// A real row lock, not a sleep or Promise.all alone, establishes overlapping SQL
// transactions. The max=2 Prisma pool must have two distinct blocked PG backends.
async function guestRaceBehindBudget(tasks: (() => Promise<unknown>)[], holdAtLeastMs = 0) {
  const blocker = new pg.Client({ connectionString: databaseUrl });
  await blocker.connect(); await blocker.query('BEGIN');
  await blocker.query("SELECT scope FROM guest_v1_budget WHERE scope='guest-v1' FOR UPDATE");
  const lockedAt = Date.now();
  const pending = Promise.allSettled(tasks.map(task => task()));
  let observed = false;
  try {
    const deadline = Date.now() + 2500;
    while (Date.now() < deadline) {
      const waiting = await setup.query(`SELECT count(DISTINCT pid)::int AS n FROM pg_stat_activity
        WHERE datname=current_database() AND wait_event_type='Lock'
        AND query ILIKE '%guest_v1_budget%'`);
      if (waiting.rows[0].n >= 2) { observed = true; break; }
      await new Promise(resolveWait => setTimeout(resolveWait, 20));
    }
    // Used only by the one-second issuance regression below. Waiting while the
    // real row is locked makes both transaction-start timestamps stale.
    const remaining = lockedAt + holdAtLeastMs - Date.now();
    if (remaining > 0) await new Promise(resolveWait => setTimeout(resolveWait, remaining));
  } finally { await blocker.query('ROLLBACK'); await blocker.end(); }
  const outcomes = await pending;
  assert.equal(observed, true, 'guest reservations must overlap on distinct PostgreSQL connections');
  return outcomes;
}

function fulfilled<T>(outcomes: PromiseSettledResult<unknown>[]): T[] {
  return outcomes.filter((value): value is PromiseFulfilledResult<T> => value.status === 'fulfilled').map(value => value.value);
}

test('guest singleton is seeded stopped with no implicit monetary or request allowance', async () => {
  const repo = await guestRepository();
  const budget = await repo.budget();
  assert.equal(budget.stopped, true);
  assert.equal(budget.maxCostMicros, null); assert.equal(budget.maxRequests, null);
  await assert.rejects(repo.issue(guestFingerprint(randomUUID()), new Date(Date.now() + 60_000)));
  const policies = await setup.query("SELECT count(*)::int AS n FROM pg_policies WHERE tablename LIKE 'guest_v1_%'");
  assert.equal(policies.rows[0].n, 0, 'guest data must have no anonymous/client RLS policy');
  const tables = await setup.query("SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename IN ('guest_v1_budget','guest_v1_sessions','guest_v1_runs','guest_v1_receipts')");
  assert.equal(tables.rows.length, 4);
  assert.ok(tables.rows.every(row => row.rowsecurity === true), 'RLS must be enabled on every guest table');
});

test('guest 50 parallel identical intents reserve once and only the first executor authorizes once', { timeout: 60_000 }, async () => {
  await resetGuestBudget();
  const repo = await guestRepository(); const session = await consentedGuest(repo);
  const intent = randomUUID();
  const outcomes = await guestRaceBehindBudget(Array.from({ length: 50 }, () => () =>
    repo.reserve(session.id, intent, guestFingerprint(guestInput), guestInput, guestPolicy, randomUUID())));
  assert.equal(outcomes.filter(value => value.status === 'rejected').length, 0);
  const reservations = fulfilled<{ run: GuestRun; created: boolean }>(outcomes);
  assert.equal(reservations.filter(value => value.created).length, 1);
  assert.equal(new Set(reservations.map(value => value.run.id)).size, 1);
  const run = reservations[0].run;
  await assertGuestBudget(repo, '100', 1, 1);
  assert.equal(await repo.authorize(run.id, randomUUID()), null, 'a different executor cannot steal permission');
  const authorized = await Promise.all(Array.from({ length: 50 }, () => repo.authorize(run.id, run.executor)));
  assert.equal(authorized.filter(Boolean).length, 1, 'replaying committed permission must not grant another send');
  const usedUntil = (await repo.session(session.tokenHash))?.usedUntil;
  assert.ok(usedUntil);
  const changedPolicy = { ...guestPolicy, model: 'synthetic-next-model', maxCostMicros: '999' };
  const replay = await repo.reserve(session.id, intent, guestFingerprint(guestInput), guestInput, changedPolicy, randomUUID());
  assert.equal(replay.created, false); assert.deepEqual(replay.run.policy, guestPolicy);
  assert.equal((await repo.session(session.tokenHash))?.usedUntil?.getTime(), usedUntil.getTime());
  await assert.rejects(repo.reserve(session.id, intent, guestFingerprint({ changed: true }), { changed: true }, guestPolicy, randomUUID()), (e: any) => e.status === 409);
  await assert.rejects(repo.reserve(session.id, randomUUID(), guestFingerprint(guestInput), guestInput, guestPolicy, randomUUID()), (e: any) => [403, 409].includes(e.status));
  await assertGuestBudget(repo, '100', 1, 1);
});

test('guest intent namespace is owned and different-intent spam cannot reserve a second run', { timeout: 60_000 }, async () => {
  await resetGuestBudget(); const repo = await guestRepository();
  const first = await consentedGuest(repo); const other = await consentedGuest(repo);
  const intent = randomUUID();
  const firstRun = await repo.reserve(first.id, intent, guestFingerprint(guestInput), guestInput, guestPolicy, randomUUID());
  const otherRun = await repo.reserve(other.id, intent, guestFingerprint({ other: true }), { other: true }, guestPolicy, randomUUID());
  assert.notEqual(firstRun.run.id, otherRun.run.id);
  assert.equal((await repo.current(first.id))?.id, firstRun.run.id);
  assert.equal((await repo.current(other.id))?.id, otherRun.run.id);
  const spam = await Promise.allSettled(Array.from({ length: 50 }, () =>
    repo.reserve(first.id, randomUUID(), guestFingerprint(guestInput), guestInput, guestPolicy, randomUUID())));
  assert.ok(spam.every(value => value.status === 'rejected' && value.reason.status === 409));
  await assertGuestBudget(repo, '200', 2, 2);
});

for (const dimension of ['cost', 'requests', 'concurrent'] as const) {
  test('guest global last ' + dimension + ' slot is atomic across 50 fresh identities', { timeout: 60_000 }, async () => {
    await resetGuestBudget(dimension === 'cost' ? { cost: '100' } : dimension === 'requests' ? { requests: 1 } : { concurrent: 1 });
    const repo = await guestRepository();
    const sessions = await Promise.all(Array.from({ length: 50 }, () => consentedGuest(repo)));
    const outcomes = await guestRaceBehindBudget(sessions.map(session => () =>
      repo.reserve(session.id, randomUUID(), guestFingerprint(guestInput), guestInput, guestPolicy, randomUUID())));
    assert.equal(fulfilled(outcomes).length, 1);
    assert.ok(outcomes.filter(value => value.status === 'rejected').every(value => (value as PromiseRejectedResult).reason.status === 429));
    await assertGuestBudget(repo, '100', 1, 1);
    assert.equal((await setup.query('SELECT count(*)::int AS n FROM guest_v1_receipts')).rows[0].n, 1);
  });
}

test('guest receipt INSERT and authorization failures roll back their complete transactions', { timeout: 30_000 }, async () => {
  await resetGuestBudget(); const repo = await guestRepository(); const session = await consentedGuest(repo);
  await setup.query(`CREATE FUNCTION synthetic_guest_receipt_failure() RETURNS trigger LANGUAGE plpgsql
    AS $$ BEGIN RAISE EXCEPTION 'Synthetic guest receipt failure'; END $$;
    CREATE TRIGGER synthetic_guest_receipt_failure AFTER INSERT ON guest_v1_receipts FOR EACH ROW EXECUTE FUNCTION synthetic_guest_receipt_failure();`);
  try {
    await assert.rejects(repo.reserve(session.id, randomUUID(), guestFingerprint(guestInput), guestInput, guestPolicy, randomUUID()));
    await assertGuestBudget(repo, '0', 0, 0); assert.equal(await repo.current(session.id), null);
  } finally { await setup.query('DROP TRIGGER synthetic_guest_receipt_failure ON guest_v1_receipts; DROP FUNCTION synthetic_guest_receipt_failure()'); }
  const executor = randomUUID();
  const { run } = await repo.reserve(session.id, randomUUID(), guestFingerprint(guestInput), guestInput, guestPolicy, executor);
  await setup.query(`CREATE FUNCTION synthetic_guest_authorize_failure() RETURNS trigger LANGUAGE plpgsql
    AS $$ BEGIN IF NEW.authorized AND NOT OLD.authorized THEN RAISE EXCEPTION 'Synthetic authorization failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER synthetic_guest_authorize_failure BEFORE UPDATE ON guest_v1_receipts FOR EACH ROW EXECUTE FUNCTION synthetic_guest_authorize_failure();`);
  try {
    await assert.rejects(repo.authorize(run.id, executor));
    assert.equal((await repo.current(session.id))?.state, 'RESERVED');
    assert.equal((await repo.session(session.tokenHash))?.usedUntil, null);
    await assertGuestBudget(repo, '100', 1, 1);
  } finally { await setup.query('DROP TRIGGER synthetic_guest_authorize_failure ON guest_v1_receipts; DROP FUNCTION synthetic_guest_authorize_failure()'); }
  assert.ok(await repo.authorize(run.id, executor));
});

test('guest predispatch stop and double cancellation never authorize the old executor or double-credit', async () => {
  await resetGuestBudget(); const repo = await guestRepository(); const { run, executor, session } = await reservedGuest(repo);
  await setup.query("UPDATE guest_v1_budget SET stopped=true WHERE scope='guest-v1'");
  assert.equal(await repo.authorize(run.id, executor), null);
  await repo.cancel(run.id, executor); await repo.cancel(run.id, executor);
  await assertGuestBudget(repo, '0', 0, 0);
  assert.equal(await repo.authorize(run.id, executor), null);
  assert.equal((await repo.session(session.tokenHash))?.usedUntil, null);
  await setup.query("UPDATE guest_v1_budget SET stopped=false WHERE scope='guest-v1'");
  const replacement = await repo.reserve(session.id, randomUUID(), guestFingerprint(guestInput), guestInput, guestPolicy, randomUUID());
  assert.equal(replacement.created, true); assert.notEqual(replacement.run.id, run.id);
  await assertGuestBudget(repo, '100', 1, 1);
});

test('guest committed authorization with lost acknowledgement cannot be replayed into a provider send', async () => {
  await resetGuestBudget(); const repo = await guestRepository(); const { run, executor, session } = await reservedGuest(repo);
  const ackLost = await guestRepository(new Proxy(prisma, { get(target, property) {
    if (property === '$transaction') return async (...args: unknown[]) => {
      await Reflect.apply(target.$transaction, target, args);
      throw new Error('Synthetic committed transaction acknowledgement loss');
    };
    const value = Reflect.get(target, property); return typeof value === 'function' ? value.bind(target) : value;
  } }));
  let providerSends = 0;
  await assert.rejects(async () => { if (await ackLost.authorize(run.id, executor)) providerSends++; });
  assert.equal(providerSends, 0);
  assert.equal((await repo.current(session.id))?.state, 'DISPATCH_AUTHORIZED');
  assert.equal(await repo.authorize(run.id, executor), null);
  await repo.cancel(run.id, executor);
  await assertGuestBudget(repo, '100', 1, 1);
});

test('guest successful terminal settlement is idempotent, persists result, and retains maximum budget occupancy', async () => {
  await resetGuestBudget(); const repo = await guestRepository(); const { run, executor, session } = await reservedGuest(repo);
  assert.ok(await repo.authorize(run.id, executor));
  const outcome = { terminal: true, result: makeValidV2Result(), usage: { inputTokens: 1, outputTokens: 1 } };
  await Promise.all([repo.finish(run.id, executor, outcome), repo.finish(run.id, executor, outcome)]);
  await assertGuestBudget(repo, '100', 1, 0);
  const saved = await repo.current(session.id);
  assert.equal(saved?.state, 'SUCCEEDED'); assert.deepEqual(saved?.result, outcome.result);
  await repo.finish(run.id, executor, outcome);
  assert.deepEqual((await repo.current(session.id))?.result, outcome.result);
  await assertGuestBudget(repo, '100', 1, 0);
});

test('guest terminal-save failure is retried without another authorization and rolls back slot release', async () => {
  await resetGuestBudget(); const repo = await guestRepository(); const { run, executor, session } = await reservedGuest(repo);
  assert.ok(await repo.authorize(run.id, executor));
  await setup.query(`CREATE FUNCTION synthetic_guest_finish_failure() RETURNS trigger LANGUAGE plpgsql
    AS $$ BEGIN IF NEW.state='SUCCEEDED' THEN RAISE EXCEPTION 'Synthetic guest finish failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER synthetic_guest_finish_failure BEFORE UPDATE ON guest_v1_runs FOR EACH ROW EXECUTE FUNCTION synthetic_guest_finish_failure();`);
  const result = makeValidV2Result();
  try {
    await assert.rejects(repo.finish(run.id, executor, { terminal: true, result }));
    assert.equal((await repo.current(session.id))?.state, 'DISPATCH_AUTHORIZED');
    assert.equal((await repo.current(session.id))?.result, null);
    await assertGuestBudget(repo, '100', 1, 1);
  } finally { await setup.query('DROP TRIGGER synthetic_guest_finish_failure ON guest_v1_runs; DROP FUNCTION synthetic_guest_finish_failure()'); }
  assert.equal(await repo.authorize(run.id, executor), null, 'a storage failure never reauthorizes generation');
  await repo.finish(run.id, executor, { terminal: true, result });
  await repo.finish(run.id, executor, { terminal: true, result });
  assert.deepEqual((await repo.current(session.id))?.result, result);
  await assertGuestBudget(repo, '100', 1, 0);
});

test('guest UNKNOWN preserves all occupancy through cleanup and changed settings and stops new admissions', async () => {
  await resetGuestBudget(); const repo = await guestRepository(); const { run, executor, session } = await reservedGuest(repo);
  assert.ok(await repo.authorize(run.id, executor));
  const usedUntil = (await repo.session(session.tokenHash))?.usedUntil;
  await repo.finish(run.id, executor, { terminal: false });
  await repo.finish(run.id, executor, { terminal: false });
  assert.equal((await assertGuestBudget(repo, '100', 1, 1)).stopped, true);
  await setup.query("UPDATE guest_v1_runs SET content_expires_at='2000-01-01' WHERE id=$1", [run.id]);
  await setup.query("UPDATE guest_v1_budget SET max_cost_micros=999999, max_requests=999, max_concurrent=999 WHERE scope='guest-v1'");
  await repo.cleanup(); await repo.cancel(run.id, executor);
  const retained = await repo.current(session.id);
  assert.equal(retained?.state, 'UNKNOWN'); assert.equal(retained?.input, null); assert.equal(retained?.result, null);
  assert.equal((await repo.session(session.tokenHash))?.usedUntil?.getTime(), usedUntil?.getTime());
  assert.equal((await assertGuestBudget(repo, '100', 1, 1)).stopped, true);
  await assert.rejects(repo.issue(guestFingerprint(randomUUID()), new Date(Date.now() + 60_000)));
  assert.equal((await setup.query('SELECT count(*)::int AS n FROM guest_v1_receipts WHERE run_id=$1', [run.id])).rows[0].n, 1);
});

for (const order of ['erase-first', 'finish-first', 'ttl-first'] as const) {
  test('guest content is not resurrected by late finish: ' + order, async () => {
    await resetGuestBudget(); const repo = await guestRepository(); const { run, executor, session } = await reservedGuest(repo);
    assert.ok(await repo.authorize(run.id, executor));
    const outcome = { terminal: true, result: makeValidV2Result() };
    if (order === 'finish-first') await repo.finish(run.id, executor, outcome);
    if (order === 'ttl-first') {
      await setup.query("UPDATE guest_v1_runs SET content_expires_at='2000-01-01' WHERE id=$1", [run.id]);
      // Reads must deny expired content before the physical cleanup runs.
      const expired = await repo.current(session.id);
      assert.equal(expired?.input, null); assert.equal(expired?.result, null);
      await repo.cleanup();
    } else await repo.erase(session.id);
    await repo.finish(run.id, executor, outcome);
    const retained = await repo.current(session.id);
    assert.equal(retained?.input, null); assert.equal(retained?.result, null);
    assert.ok(retained?.deletedAt);
    assert.ok((await repo.session(session.tokenHash))?.usedUntil);
    await assertGuestBudget(repo, '100', 1, 0);
    assert.equal((await setup.query('SELECT count(*)::int AS n FROM guest_v1_receipts WHERE run_id=$1', [run.id])).rows[0].n, 1);
  });
}

test('guest stale or missing consent and expired/revoked identities cannot consume a reservation', async () => {
  await resetGuestBudget(); const repo = await guestRepository();
  const unconsented = await repo.issue(guestFingerprint(randomUUID()), new Date(Date.now() + 60_000));
  const reserve = (sessionId: string, policy = guestPolicy) => repo.reserve(sessionId, randomUUID(), guestFingerprint(guestInput), guestInput, policy, randomUUID());
  await assert.rejects(reserve(unconsented.id));
  await repo.consent(unconsented.id, guestPolicy);
  await assert.rejects(reserve(unconsented.id, { ...guestPolicy, consentVersion: 'synthetic-next-consent' }));
  await setup.query("UPDATE guest_v1_sessions SET issued_expires_at='2000-01-01' WHERE id=$1", [unconsented.id]);
  await assert.rejects(reserve(unconsented.id));
  const revoked = await consentedGuest(repo);
  await setup.query('UPDATE guest_v1_sessions SET revoked_at=now() WHERE id=$1', [revoked.id]);
  await assert.rejects(reserve(revoked.id));
  await assertGuestBudget(repo, '0', 0, 0);
});

test('guest identifier expiry cleanup cannot erase UNKNOWN liability or make an old entitlement available', async () => {
  await resetGuestBudget(); const repo = await guestRepository(); const { run, executor, session } = await reservedGuest(repo);
  assert.ok(await repo.authorize(run.id, executor));
  await repo.finish(run.id, executor, { terminal: false });
  await setup.query("UPDATE guest_v1_sessions SET used_until='2000-02-01', issued_expires_at='2000-01-01' WHERE id=$1", [session.id]);
  await setup.query("UPDATE guest_v1_runs SET content_expires_at='2000-01-02' WHERE id=$1", [run.id]);
  await repo.cleanup();
  assert.equal(await repo.session(session.tokenHash), null);
  await assert.rejects(repo.reserve(session.id, randomUUID(), guestFingerprint(guestInput), guestInput, guestPolicy, randomUUID()));
  assert.equal((await repo.current(session.id))?.state, 'UNKNOWN');
  assert.equal((await assertGuestBudget(repo, '100', 1, 1)).stopped, true);
  assert.equal((await setup.query('SELECT count(*)::int AS n FROM guest_v1_receipts WHERE run_id=$1', [run.id])).rows[0].n, 1);
});

test('guest restart recovery cancels only predispatch runs and fences authorized work as UNKNOWN without refund', async () => {
  await resetGuestBudget(); const repo = await guestRepository();
  const predispatch = await reservedGuest(repo);
  const authorized = await reservedGuest(repo);
  const completed = await reservedGuest(repo);
  assert.ok(await repo.authorize(authorized.run.id, authorized.executor));
  assert.ok(await repo.authorize(completed.run.id, completed.executor));
  const result = makeValidV2Result();
  await repo.finish(completed.run.id, completed.executor, { terminal: true, result });
  await assertGuestBudget(repo, '300', 3, 2);
  const usedUntil = (await repo.session(authorized.session.tokenHash))?.usedUntil;

  await repo.recover();
  assert.equal((await repo.current(predispatch.session.id))?.state, 'CANCELLED');
  assert.equal((await repo.current(authorized.session.id))?.state, 'UNKNOWN');
  assert.equal((await repo.current(completed.session.id))?.state, 'SUCCEEDED');
  assert.deepEqual((await repo.current(completed.session.id))?.result, result);
  assert.equal((await repo.session(authorized.session.tokenHash))?.usedUntil?.getTime(), usedUntil?.getTime());
  assert.equal((await assertGuestBudget(repo, '200', 2, 1)).stopped, true);
  assert.equal(await repo.authorize(predispatch.run.id, predispatch.executor), null);
  assert.equal(await repo.authorize(authorized.run.id, authorized.executor), null);
  await repo.cancel(authorized.run.id, authorized.executor);
  await repo.recover();
  assert.equal((await assertGuestBudget(repo, '200', 2, 1)).stopped, true);

  // Simulate a changed DB configuration in the isolated fixture; no production
  // reset/unstop endpoint is provided. UNKNOWN still latches startup closed.
  await setup.query("UPDATE guest_v1_budget SET stopped=false WHERE scope='guest-v1'");
  await repo.recover();
  assert.equal((await assertGuestBudget(repo, '200', 2, 1)).stopped, true);
});

for (const limit of ['issuance_limit', 'issue_window_limit'] as const) {
  test('guest ' + limit + ' is atomic under concurrent explicit issuance', { timeout: 60_000 }, async () => {
    await resetGuestBudget(); const repo = await guestRepository();
    // The column comes from this closed test-only union, never a request value.
    await setup.query(`UPDATE guest_v1_budget SET ${limit}=1 WHERE scope='guest-v1'`);
    const outcomes = await guestRaceBehindBudget(Array.from({ length: 50 }, () => () =>
      repo.issue(guestFingerprint(randomUUID()), new Date(Date.now() + 60_000))));
    assert.equal(fulfilled(outcomes).length, 1);
    assert.ok(outcomes.filter(value => value.status === 'rejected').every(value => (value as PromiseRejectedResult).reason.status === 429));
    await assertGuestBudget(repo, '0', 0, 0);
    assert.equal((await setup.query('SELECT count(*)::int AS n FROM guest_v1_sessions')).rows[0].n, 1);
  });
}

test('guest issuance window counts insertion time after a lock wait, not stale transaction start', { timeout: 15_000 }, async () => {
  await resetGuestBudget(); const repo = await guestRepository();
  await setup.query("UPDATE guest_v1_budget SET issue_window_seconds=1, issue_window_limit=1 WHERE scope='guest-v1'");
  const outcomes = await guestRaceBehindBudget(Array.from({ length: 2 }, () => () =>
    repo.issue(guestFingerprint(randomUUID()), new Date(Date.now() + 60_000))), 1500);
  assert.equal(fulfilled(outcomes).length, 1, 'the second queued issuer must count the row inserted after lock release');
  const denied = outcomes.find(value => value.status === 'rejected') as PromiseRejectedResult;
  assert.equal(denied.reason.status, 429);
  assert.equal((await setup.query('SELECT count(*)::int AS n FROM guest_v1_sessions')).rows[0].n, 1);
  await assertGuestBudget(repo, '0', 0, 0);
});
