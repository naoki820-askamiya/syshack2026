import assert from 'node:assert/strict';
import test, { after } from 'node:test';
process.env.DATABASE_URL ??= 'postgresql://synthetic:synthetic@127.0.0.1:1/offline';
const [{ prisma }, { Prisma }, repository, service, schemas] = await Promise.all([
  import('../prisma/client.js'), import('../generated/prisma/client.js'), import('./workflow.repository.js'),
  import('./workflow.service.js'), import('./schemas.js'),
]);
after(() => prisma.$disconnect());
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const key = '33333333-3333-4333-8333-333333333333';
const input = { newPerson: { displayName: 'Synthetic friend', relationshipType: 'friend' as const },
  userAgeRange: 'unknown', userGender: 'unknown', perceivedPartnerReaction: 'unknown', elapsedTimeType: 'unknown',
  eventFacts: 'Synthetic event', userResponseType: 'none' as const, userResponseText: null, createIntentKey: key };
function replace(t: test.TestContext, target: any, method: string, fn: (...args: any[]) => any) {
  const original = target[method]; target[method] = fn; t.after(() => { target[method] = original; });
}
function fixture(t: test.TestContext) {
  let rows = { people: [] as any[], cases: [] as any[] }; let next = 0, transactions = 0;
  const behavior = { failPerson: false, failCase: false, collide: false };
  const find = (list: any[], where: any) => list.find(row => Object.entries(where).every(([k, v]) => row[k] === v)) ?? null;
  const methods = (state: typeof rows) => ({
    person: { findFirst: async ({ where }: any) => find(state.people, where), create: async ({ data }: any) => {
      if (behavior.failPerson) throw new Error('Synthetic Person insert failure');
      const person = { id: 'person-' + ++next, archivedAt: null, ...data }; state.people.push(person); return person;
    } },
    analysisCase: { findFirst: async ({ where }: any) => find(state.cases, where), create: async ({ data }: any) => {
      if (behavior.failCase) throw new Error('Synthetic Case insert failure');
      if (behavior.collide) {
        behavior.collide = false;
        rows.people.push({ id: 'winner-person', userId: owner, archivedAt: null });
        rows.cases.push({ ...data, id: 'winner-case', personId: 'winner-person' });
        throw new Prisma.PrismaClientKnownRequestError('Synthetic duplicate', { code: 'P2002', clientVersion: 'test', meta: { target: ['user_id', 'create_intent_key'] } });
      }
      const analysisCase = { id: 'case-' + ++next, status: 'draft', ...data }; state.cases.push(analysisCase); return analysisCase;
    } },
  });
  replace(t, prisma, '$transaction', async (fn: any) => {
    transactions++;
    const pending = structuredClone(rows);
    const value = await fn(methods(pending));
    rows = pending; return value;
  });
  replace(t, prisma.person, 'findFirst', (arg: any) => methods(rows).person.findFirst(arg));
  replace(t, prisma.analysisCase, 'findFirst', (arg: any) => methods(rows).analysisCase.findFirst(arg));
  return { behavior, get rows() { return rows; }, get transactions() { return transactions; } };
}

test('new-person request validates the complete pair before any transaction and excludes identity/snapshot injection', async t => {
  const f = fixture(t);
  const { createIntentKey: _key, ...withoutKey } = input;
  for (const invalid of [withoutKey, { ...input, personId: owner }, { ...input, userId: other },
    { ...input, personSnapshot: {} }, { ...input, newPerson: { ...input.newPerson, userId: other } },
    { ...input, eventFacts: '' }, { ...input, userResponseType: 'action' }, { ...input, createIntentKey: 'invalid' }]) {
    await assert.rejects(service.createAnalysisCase(owner, invalid), (e: any) => e.status === 400);
  }
  assert.equal(f.transactions, 0);
  assert.equal(schemas.createCaseRequestSchema.safeParse({ ...input, newPerson: undefined, personId: owner }).success, false);
});
for (const failing of ['failPerson', 'failCase'] as const) test('transaction rolls back the entire pair after ' + failing, async t => {
  const f = fixture(t); f.behavior[failing] = true;
  await assert.rejects(service.createAnalysisCase(owner, input));
  assert.equal(f.rows.people.length, 0); assert.equal(f.rows.cases.length, 0);
  f.behavior[failing] = false;
  const result = await service.createAnalysisCase(owner, input);
  assert.equal(f.rows.people.length, 1); assert.equal(f.rows.cases.length, 1);
  assert.equal(result.analysisCase.personId, f.rows.people[0].id);
});
test('lost combined response replays the same pair and original snapshot without extra writes', async t => {
  const f = fixture(t);
  const first = await service.createAnalysisCase(owner, input);
  const persisted = f.rows.cases[0];
  f.rows.people[0].displayName = 'Later edit'; persisted.status = 'failed';
  const replay = await service.createAnalysisCase(owner, input);
  assert.equal(replay.analysisCase.id, first.analysisCase.id); assert.equal(replay.analysisCase.status, 'failed');
  assert.deepEqual(replay.analysisCase.personSnapshot, first.analysisCase.personSnapshot);
  assert.equal(f.rows.people.length, 1); assert.equal(f.rows.cases.length, 1);
  assert.equal(Object.hasOwn(replay.analysisCase, 'createIntentKey'), false);
  assert.equal(Object.hasOwn(replay.analysisCase, 'createIntentFingerprint'), false);
});
test('changed Person or Case data under one key conflicts without inserting another Person; owners are isolated', async t => {
  const f = fixture(t); await service.createAnalysisCase(owner, input);
  for (const changed of [{ ...input, eventFacts: 'Changed' }, { ...input, newPerson: { ...input.newPerson, displayName: 'Changed' } }]) {
    await assert.rejects(service.createAnalysisCase(owner, changed), (e: any) => e.status === 409 && e.code === 'CREATE_INTENT_CONFLICT');
  }
  assert.equal(f.rows.people.length, 1); assert.equal(f.rows.cases.length, 1);
  await service.createAnalysisCase(other, input);
  assert.equal(f.rows.people.length, 2); assert.equal(f.rows.cases.length, 2);
});
test('unique-key loser replays only after transaction rollback and never commits its provisional Person', async t => {
  const f = fixture(t); f.behavior.collide = true;
  const result = await service.createAnalysisCase(owner, input);
  assert.equal(result.analysisCase.id, 'winner-case');
  assert.deepEqual(f.rows.people.map(p => p.id), ['winner-person']); assert.equal(f.rows.cases.length, 1);
});
test('archived combined replay fails closed and creates nothing', async t => {
  const f = fixture(t); await service.createAnalysisCase(owner, input); f.rows.people[0].archivedAt = new Date();
  await assert.rejects(service.createAnalysisCase(owner, input), (e: any) => e.status === 404);
  assert.equal(f.rows.people.length, 1); assert.equal(f.rows.cases.length, 1);
});
test('analysis-start failure preserves the saved pair for same-case recovery', async t => {
  const f = fixture(t); const saved = await service.createAnalysisCase(owner, input);
  replace(t, prisma, '$transaction', async () => { throw new Error('Synthetic analysis start failure'); });
  const log = console.info; console.info = () => {}; t.after(() => { console.info = log; });
  await assert.rejects(service.analyzeCase(owner, saved.analysisCase.id));
  assert.equal(f.rows.people.length, 1); assert.equal(f.rows.cases.length, 1); assert.equal(f.rows.cases[0].status, 'draft');
});
