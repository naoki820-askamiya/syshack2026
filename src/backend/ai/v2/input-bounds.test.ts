import assert from 'node:assert/strict';
import test from 'node:test';
import { aiAnalysisInputSchema } from './input.schema.js';
import { analyzeMoodV2, AnalyzeMoodV2Error } from './analyzeMood.js';
import { buildAiInput, buildContextSnapshot } from './context.js';
import { makeValidV2Result } from './testFixture.js';

const base = {
  referenceContext: { personProfile: null as unknown, userPatternSummary: null,
    recentCaseSummaries: [], recentFeedbacks: [] },
  untrustedUserInput: { person: { displayName: '相手', relationshipType: 'coworker' },
    currentCase: { userAgeRange: '20代', userGender: '回答しない',
      perceivedPartnerReaction: '通常', elapsedTimeType: '数時間', eventFacts: '短い返信が届いた。',
      userResponseType: 'none' as const, userResponseText: null } },
};
const inputWith = (profile: unknown) => ({ ...base,
  referenceContext: { ...base.referenceContext, personProfile: profile } });
const nested = (depth: number) => {
  let value: unknown = 'leaf';
  for (let index = 0; index < depth; index++) value = { child: value };
  return value;
};

test('Profile JSON byte boundary counts UTF-8 and JSON escapes without truncation', () => {
  for (const accepted of ['x'.repeat(65534), 'あ'.repeat(21844), '\n'.repeat(32767)]) {
    const parsed = aiAnalysisInputSchema.safeParse(inputWith(accepted));
    assert.equal(parsed.success, true);
    if (parsed.success) assert.equal(parsed.data.referenceContext.personProfile, accepted);
  }
  for (const denied of ['x'.repeat(65535), 'あ'.repeat(21845), '\n'.repeat(32768)]) {
    assert.equal(aiAnalysisInputSchema.safeParse(inputWith(denied)).success, false);
  }
});

test('Profile permits depth16 and rejects depth17 without recursive serialization', () => {
  assert.equal(aiAnalysisInputSchema.safeParse(inputWith(nested(16))).success, true);
  assert.equal(aiAnalysisInputSchema.safeParse(inputWith(nested(17))).success, false);
});

test('total serialized AI input rejects 128KiB+1 and accepts exactly128KiB', () => {
  const make = (bytes: number) => ({ text: 'x'.repeat(bytes - 11) });
  assert.equal(Buffer.byteLength(buildAiInput(make(131072) as never), 'utf8'), 131072);
  assert.throws(() => buildAiInput(make(131073) as never), /上限/);
});

test('context snapshot rejects oversized/deep Profile before copying saved context', () => {
  for (const profile of ['あ'.repeat(250000), nested(17)]) {
    assert.throws(() => buildContextSnapshot(inputWith(profile).referenceContext as never), /上限/);
  }
});

test('oversized and cyclic Profile have explicit zero-attempt predispatch failure', async () => {
  const cycle: Record<string, unknown> = {}; cycle.child = cycle;
  const oldKey = process.env.OPENAI_API_KEY;
  const oldModel = process.env.OPENAI_ANALYSIS_MODEL;
  process.env.OPENAI_API_KEY = 'synthetic-key'; process.env.OPENAI_ANALYSIS_MODEL = 'synthetic-model';
  try {
    for (const profile of ['あ'.repeat(250000), nested(17), cycle]) {
      let sends = 0;
      const client = { parse: async () => { sends++; return {
        status: 'completed', output: [], output_parsed: makeValidV2Result() }; } };
      await assert.rejects(analyzeMoodV2(inputWith(profile) as never, { client: client as never }),
        error => error instanceof AnalyzeMoodV2Error && error.code === 'AI_INPUT_LIMIT_EXCEEDED' && error.attempts === 0);
      assert.equal(sends, 0);
    }
  } finally {
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey;
    if (oldModel === undefined) delete process.env.OPENAI_ANALYSIS_MODEL; else process.env.OPENAI_ANALYSIS_MODEL = oldModel;
  }
});

test('every retry carries approved output cap and incomplete output is never returned', async () => {
  const oldKey = process.env.OPENAI_API_KEY;
  const oldModel = process.env.OPENAI_ANALYSIS_MODEL;
  process.env.OPENAI_API_KEY = 'synthetic-key'; process.env.OPENAI_ANALYSIS_MODEL = 'synthetic-model';
  try {
    const bodies: Record<string, unknown>[] = [];
    const client = { parse: async (body: Record<string, unknown>) => {
      bodies.push(body);
      return { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' },
        output: [], output_parsed: makeValidV2Result() };
    } };
    await assert.rejects(analyzeMoodV2(base as never, { client: client as never }),
      error => error instanceof AnalyzeMoodV2Error && error.code === 'AI_OUTPUT_INVALID' && error.attempts === 3);
    assert.equal(bodies.length, 3);
    for (const body of bodies) assert.equal(body.max_output_tokens, 32768);
  } finally {
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey;
    if (oldModel === undefined) delete process.env.OPENAI_ANALYSIS_MODEL; else process.env.OPENAI_ANALYSIS_MODEL = oldModel;
  }
});

test('executable JSON hooks and getters are rejected without invoking them or dispatching', async () => {
  let executions = 0, sends = 0;
  const toJSON = {};
  Object.defineProperty(toJSON, 'toJSON', { enumerable: false,
    value: () => { executions++; return 'x'.repeat(200000); } });
  const getter = {};
  Object.defineProperty(getter, 'text', { enumerable: true,
    get: () => { executions++; return 'x'.repeat(200000); } });
  const client = { parse: async () => { sends++; throw new Error('must not dispatch'); } };
  for (const profile of [toJSON, getter]) {
    assert.equal(aiAnalysisInputSchema.safeParse(inputWith(profile)).success, false);
    assert.throws(() => buildAiInput(inputWith(profile) as never), /上限/);
    assert.throws(() => buildContextSnapshot(inputWith(profile).referenceContext as never), /上限/);
    await assert.rejects(analyzeMoodV2(inputWith(profile) as never, { client: client as never }),
      error => error instanceof AnalyzeMoodV2Error && error.code === 'AI_INPUT_LIMIT_EXCEEDED' && error.attempts === 0);
  }
  assert.equal(executions, 0);
  assert.equal(sends, 0);
});

test('huge or sparse arrays and non-JSON values fail before serialization or dispatch', async () => {
  let sends = 0;
  const client = { parse: async () => { sends++; throw new Error('must not dispatch'); } };
  const iteratorArray = [1];
  Object.defineProperty(iteratorArray, Symbol.iterator, { value: () => { throw new Error('must not iterate'); } });
  for (const profile of [Array(1000000000), Array(4), iteratorArray, new Date(),
    { text: undefined }, { text: () => 'invalid' }, { text: BigInt(1) }, { text: Number.NaN },
    { text: Number.POSITIVE_INFINITY }]) {
    assert.equal(aiAnalysisInputSchema.safeParse(inputWith(profile)).success, false);
    await assert.rejects(analyzeMoodV2(inputWith(profile) as never, { client: client as never }),
      error => error instanceof AnalyzeMoodV2Error && error.code === 'AI_INPUT_LIMIT_EXCEEDED' && error.attempts === 0);
  }
  assert.equal(sends, 0);
});
