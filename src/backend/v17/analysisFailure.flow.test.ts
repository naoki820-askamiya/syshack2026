import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import OpenAI from 'openai';
import { analyzeMoodV2 } from '../ai/v2/analyzeMood.js';
import { makeValidV2Result } from '../ai/v2/testFixture.js';
import { ensureSavedCaseAnalysis, type SavedAnalysisStatus } from '../../app/utils/analysisRetry.js';

process.env.DATABASE_URL ??= 'postgresql://synthetic:synthetic@127.0.0.1:1/no_network';
const [{ prisma }, service, repository] = await Promise.all([
  import('../prisma/client.js'), import('./workflow.service.js'), import('./workflow.repository.js'),
]);
after(() => prisma.$disconnect());
const USER = '11111111-1111-4111-8111-111111111111';
const CASE = '55555555-5555-4555-8555-555555555555';
const RUN = '88888888-8888-4888-8888-888888888888';
const USAGE = '99999999-9999-4999-8999-999999999999';

function replace(t: test.TestContext, target: object, key: string, implementation: any) {
  const methods = target as Record<string, any>;
  const original = methods[key];
  methods[key] = implementation;
  t.after(() => { methods[key] = original; });
}

function setup(t: test.TestContext, failWrites = 0) {
  const previous = { key: process.env.OPENAI_API_KEY, model: process.env.OPENAI_ANALYSIS_MODEL };
  process.env.OPENAI_API_KEY = 'synthetic-no-network'; process.env.OPENAI_ANALYSIS_MODEL = 'synthetic-model';
  t.after(() => {
    if (previous.key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previous.key;
    if (previous.model === undefined) delete process.env.OPENAI_ANALYSIS_MODEL; else process.env.OPENAI_ANALYSIS_MODEL = previous.model;
  });
  const row = { id: CASE, userId: USER, personId: CASE, status: 'draft' as SavedAnalysisStatus,
    analyzeRunId: null as string | null, analyzeStartedAt: new Date('2026-01-01T00:00:00Z'),
    failureCode: null as string | null, failureMessage: null as string | null,
    personSnapshot: { person: { displayName: '相手A', relationshipType: 'coworker' } },
    userAgeRange: '20代', userGender: '回答しない', perceivedPartnerReaction: '短い返信', elapsedTimeType: '数時間後',
    eventFacts: '確認に短い返信があった。', userResponseType: 'none', userResponseText: null };
  let usage: Record<string, any> | null = null;
  let saves = 0, sends = 0, failureWrites = 0;
  const events: unknown[][] = [];
  replace(t, console, 'info', (...args: unknown[]) => { events.push(args); });
  replace(t, console, 'error', (...args: unknown[]) => { events.push(args); });
  const matches = (item: Record<string, any>, where: Record<string, any>) =>
    Object.entries(where).every(([key, value]) => key === 'analyzeStartedAt'
      ? item.analyzeStartedAt < value.lt : item[key] === value);
  const caseUpdate = async (args: any) => {
    if (!matches(row, args.where)) return { count: 0 };
    Object.assign(row, args.data); return { count: 1 };
  };
  replace(t, prisma, '$transaction', (async (callback: any) => callback({
    $queryRaw: async (sql: any) => {
      const text = 'strings' in sql ? sql.strings.join('') : Array.from(sql).join('');
      if (text.includes('INSERT INTO analysis_results')) { saves++; return []; }
      if (text.includes('UPDATE analysis_cases')) {
        row.status = 'analyzing'; row.analyzeRunId = RUN; return [{ analyze_run_id: RUN }];
      }
      return [{ locked: 1 }];
    },
    analysisCase: { findFirst: async ({ where }: any) => matches(row, where) ? { ...row } : null, updateMany: caseUpdate },
    rateLimitPolicy: { findMany: async () => [] },
    apiUsageEvent: {
      create: async ({ data }: any) => { usage = { id: USAGE, ...data }; return { id: USAGE }; },
      findFirst: async ({ where }: any) => usage && matches(usage, where) ? { id: usage.id } : null,
    },
  })) as never);
  replace(t, prisma.analysisCase, 'findFirst', (async ({ where }: any) => matches(row, where) ? { ...row } : null) as never);
  replace(t, prisma.userPrivacySetting, 'upsert', (async () => ({ personalizationEnabled: false })) as never);
  replace(t, prisma.analysisCase, 'updateMany', (async (args: any) => {
    if (++failureWrites <= failWrites) throw new Error('synthetic transient DB error');
    return caseUpdate(args);
  }) as never);
  replace(t, prisma.apiUsageEvent, 'updateMany', (async ({ where, data }: any) => {
    if (!usage || !matches(usage, where)) return { count: 0 };
    Object.assign(usage, data); return { count: 1 };
  }) as never);
  const client = (text: string, status = 'completed') => new OpenAI({ apiKey: 'synthetic-no-network',
    baseURL: 'http://127.0.0.1:1/no-network', fetch: (async () => {
      sends++;
      return new Response(JSON.stringify({ id: 'resp_synthetic', object: 'response', created_at: 0,
        model: 'synthetic-model', status, output: [{ type: 'message', id: 'msg_synthetic', status: 'completed',
          role: 'assistant', content: [{ type: 'output_text', text, annotations: [] }] }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as never,
  }).responses;
  return { row, events, client, get usage() { return usage; }, get sends() { return sends; },
    get saves() { return saves; }, get failureWrites() { return failureWrites; } };
}

test('legacy input failure completes the run and settles zero provider sends', async t => {
  const fixture = setup(t); fixture.row.eventFacts = 'x'.repeat(3001);
  await assert.rejects(service.analyzeCase(USER, CASE, { generate: async input =>
    analyzeMoodV2(input, { client: fixture.client(JSON.stringify(makeValidV2Result())) }) }),
  (error: any) => error.code === 'AI_INPUT_INVALID' && error.status === 422);
  assert.equal(fixture.sends, 0); assert.equal(fixture.saves, 0);
  assert.equal(fixture.row.status, 'failed');
  assert.equal(fixture.usage?.status, 'failed'); assert.equal(fixture.usage?.costUnits, 0);
});

for (const failWrites of [0, 1, 2]) {
  test(`unsafe SDK output and ${failWrites} failed compensation writes reconcile through the UI retry contract`, async t => {
    const fixture = setup(t, failWrites);
    const result = makeValidV2Result(); result.summary.oneLine = '診断結果として相手の状態が確定しているという十分な長さの文章です。';
    let starts = 0;
    await assert.rejects(ensureSavedCaseAnalysis(CASE, {
      latest: async () => false,
      state: async () => (await service.getAnalysisCase(USER, CASE)).analysisCase.status as SavedAnalysisStatus,
      start: async () => { starts++; await service.analyzeCase(USER, CASE, {
        generate: async input => analyzeMoodV2(input, { client: fixture.client(JSON.stringify(result)) }),
      }); },
    }, true), (error: any) => error.code === 'AI_OUTPUT_UNSAFE');
    assert.equal(starts, 1); assert.equal(fixture.sends, 1); assert.equal(fixture.saves, 0);
    assert.equal(fixture.row.status, 'failed');
    assert.equal(fixture.usage?.status, 'failed'); assert.equal(fixture.usage?.costUnits, 1);
    assert.equal(fixture.failureWrites, failWrites === 0 ? 1 : 2);
  });
}

test('real SDK malformed output settles three attempted sends and persists no result', async t => {
  const fixture = setup(t);
  await assert.rejects(service.analyzeCase(USER, CASE, { generate: async input =>
    analyzeMoodV2(input, { client: fixture.client('{') }) }), (error: any) => error.code === 'AI_OUTPUT_INVALID');
  assert.equal(fixture.sends, 3); assert.equal(fixture.row.status, 'failed');
  assert.equal(fixture.usage?.costUnits, 3); assert.equal(fixture.saves, 0);
});

test('unknown dispatch failure and stale state recovery never refund the reservation', async t => {
  const fixture = setup(t, 2);
  await assert.rejects(service.analyzeCase(USER, CASE, { generate: async input =>
    analyzeMoodV2(input, { client: { parse: async () => { throw new Error('synthetic unknown dispatch failure'); } } as never }) }));
  assert.equal(fixture.usage?.status, 'allowed'); assert.equal(fixture.usage?.costUnits, 3);
  assert.equal((await service.getAnalysisCase(USER, CASE)).analysisCase.status, 'analyzing');
  assert.equal((await repository.recoverStaleAnalysis({ userId: USER, caseId: CASE, analyzeRunId: RUN,
    cutoff: new Date('2026-01-02T00:00:00Z') })).count, 1);
  assert.equal(fixture.row.status, 'failed');
  assert.equal(fixture.usage?.status, 'allowed'); assert.equal(fixture.usage?.costUnits, 3);
});

test('failure receipt recovery cannot change another owner or a replacement run', async t => {
  const fixture = setup(t, 2);
  const result = makeValidV2Result(); result.summary.oneLine = '診断結果として相手の状態が確定しているという十分な長さの文章です。';
  await assert.rejects(service.analyzeCase(USER, CASE, { generate: async input =>
    analyzeMoodV2(input, { client: fixture.client(JSON.stringify(result)) }) }));
  const other = '22222222-2222-4222-8222-222222222222';
  assert.equal((await repository.reconcileFailedAnalysis(other, CASE, RUN)).count, 0);
  fixture.row.analyzeRunId = other;
  assert.equal((await repository.reconcileFailedAnalysis(USER, CASE, RUN)).count, 0);
  assert.equal((await repository.reconcileFailedAnalysis(USER, CASE, other)).count, 0);
  assert.equal(fixture.row.status, 'analyzing');
  assert.equal(fixture.usage?.costUnits, 1);
});
