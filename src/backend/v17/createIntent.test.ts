import assert from 'node:assert/strict';
import test, { after } from 'node:test';
process.env.DATABASE_URL ??= 'postgresql://test:test@127.0.0.1:5432/kigen404_test';
const [{ prisma }, { Prisma }, persons, workflow, schemas] = await Promise.all([
  import('../prisma/client.js'), import('../generated/prisma/client.js'), import('./persons.repository.js'),
  import('./workflow.repository.js'), import('./schemas.js'),
]);
after(() => prisma.$disconnect());
const owner = '11111111-1111-4111-8111-111111111111';
const key = '22222222-2222-4222-8222-222222222222';
const personId = '33333333-3333-4333-8333-333333333333';
const personInput = { displayName: 'Synthetic', relationshipType: 'friend' as const, createIntentKey: key };
const caseInput = { personId, userAgeRange: 'unknown', userGender: 'unknown', perceivedPartnerReaction: 'unknown',
  elapsedTimeType: 'unknown', eventFacts: 'Synthetic', userResponseType: 'none', userResponseText: null, createIntentKey: key };
function replace(t: test.TestContext, object: any, method: string, fn: (...args: any[]) => any) {
  const original = object[method]; object[method] = fn; t.after(() => { object[method] = original; });
}
const duplicate = (target = ['user_id', 'create_intent_key']) => new Prisma.PrismaClientKnownRequestError('Synthetic duplicate',
  { code: 'P2002', clientVersion: 'test', meta: { target } });

test('installed PostgreSQL adapter constraint metadata is matched narrowly without parsing messages', async () => {
  const { isCreateIntentCollision } = await import('./createIntent.js');
  const error = (fields: string[], code = 'P2002') => new Prisma.PrismaClientKnownRequestError('Synthetic', { code, clientVersion: '7.9.1',
    meta: { driverAdapterError: { cause: { originalCode: '23505', kind: 'UniqueConstraintViolation', constraint: { fields } } } } });
  assert.equal(isCreateIntentCollision(error(['user_id', 'create_intent_key']), 'persons'), true);
  assert.equal(isCreateIntentCollision(error(['id']), 'persons'), false);
  assert.equal(isCreateIntentCollision(error(['user_id', 'create_intent_key'], 'P2003'), 'persons'), false);
  assert.equal(isCreateIntentCollision(new Error('P2002 persons_user_id_create_intent_key_key'), 'persons'), false);
});

test('canonical fingerprint excludes input ordering/key/snapshot and public envelopes omit retry metadata', async () => {
  const { caseIntentFingerprint, personIntentFingerprint, publicCreatedResource } = await import('./createIntent.js');
  assert.equal(personIntentFingerprint(personInput), personIntentFingerprint({ displayName: '  Synthetic ', relationshipType: 'friend', notes: null }));
  assert.equal(caseIntentFingerprint(caseInput), caseIntentFingerprint({ ...caseInput, personId: personId.toUpperCase() }));
  assert.notEqual(caseIntentFingerprint(caseInput), caseIntentFingerprint({ ...caseInput, eventFacts: 'Different' }));
  assert.deepEqual(publicCreatedResource({ id: 'public', createIntentKey: key, createIntentFingerprint: 'private' }), { id: 'public' });
});

test('POST accepts an optional dedicated UUID key; PATCH/fingerprint injection remain rejected', () => {
  assert.equal(schemas.createPersonSchema.safeParse(personInput).success, true);
  assert.equal(schemas.createAnalysisCaseSchema.safeParse(caseInput).success, true);
  assert.equal(schemas.updatePersonSchema.safeParse({ createIntentKey: key }).success, false);
  assert.equal(schemas.createPersonSchema.safeParse({ ...personInput, createIntentFingerprint: 'injected' }).success, false);
  assert.equal(schemas.createPersonSchema.safeParse({ ...personInput, createIntentKey: 'not-uuid' }).success, false);
});

test('Person response-loss replay returns current resource using immutable original fingerprint', async t => {
  let stored: any; let rows = 0;
  replace(t, prisma.person, 'create', async ({ data }) => { if (stored) throw duplicate(); stored = { id: personId, ...data, archivedAt: null }; rows++; return stored; });
  replace(t, prisma.person, 'findFirst', async ({ where }) => { assert.deepEqual(where, { userId: owner, createIntentKey: key }); return stored; });
  await persons.createPerson(owner, personInput);
  assert.equal(stored.createIntentKey, key); assert.match(stored.createIntentFingerprint, /^v1:[a-f0-9]{64}$/);
  stored = { ...stored, displayName: 'Explicitly edited', relationshipType: 'coworker' };
  assert.equal((await persons.createPerson(owner, { ...personInput, notes: null })).displayName, 'Explicitly edited');
  assert.equal(rows, 1);
  await assert.rejects(persons.createPerson(owner, { ...personInput, displayName: 'Different' }), (e: any) => e.status === 409 && e.code === 'CREATE_INTENT_CONFLICT');
});

test('Person archive replay fails closed; unrelated unique errors propagate unchanged', async t => {
  let stored: any;
  replace(t, prisma.person, 'create', async ({ data }) => { if (stored) throw duplicate(); stored = { id: personId, ...data, archivedAt: null }; return stored; });
  replace(t, prisma.person, 'findFirst', async () => stored);
  await persons.createPerson(owner, personInput); stored.archivedAt = new Date();
  await assert.rejects(persons.createPerson(owner, personInput), (e: any) => e.status === 404);
  const unrelated = duplicate(['id']); replace(t, prisma.person, 'create', async () => { throw unrelated; });
  await assert.rejects(persons.createPerson(owner, personInput), e => e === unrelated);
});

test('Case duplicate recovery runs after the failed transaction and retains original snapshot', async t => {
  let stored: any; let inside = false; let inserts = 0;
  replace(t, prisma, '$transaction', async callback => { inside = true; try { return await callback({
    $queryRaw: async () => [{ displayName: 'Locked current Person', relationshipType: 'friend' }],
    analysisCase: { create: async ({ data }: any) => { inserts++; if (stored) throw duplicate(); stored = { id: 'saved-case', ...data }; return stored; } },
  }); } finally { inside = false; } });
  replace(t, prisma.analysisCase, 'findFirst', async ({ where }) => { assert.equal(inside, false); assert.deepEqual(where, { userId: owner, createIntentKey: key }); return stored; });
  replace(t, prisma.person, 'findFirst', async () => ({ id: personId }));
  const first = await workflow.createCase(owner, caseInput);
  assert.equal(stored.createIntentKey, key); assert.match(stored.createIntentFingerprint, /^v1:[a-f0-9]{64}$/);
  const replay = await workflow.createCase(owner, caseInput);
  assert.equal(replay.id, first.id); assert.deepEqual(replay.personSnapshot, first.personSnapshot);
  assert.equal(inserts, 2);
  await assert.rejects(workflow.createCase(owner, { ...caseInput, eventFacts: 'Different' }), (e: any) => e.status === 409);
});
