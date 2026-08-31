import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeMoodV2, AnalyzeMoodV2Error } from './analyzeMood.js';
import { makeValidV2Result } from './testFixture.js';

const input = {
  referenceContext: {
    personProfile: null,
    userPatternSummary: null,
    recentCaseSummaries: [],
    recentFeedbacks: [],
  },
  untrustedUserInput: {
    person: { displayName: '相手A', relationshipType: 'coworker' },
    currentCase: {
      userAgeRange: '20代', userGender: '回答しない',
      perceivedPartnerReaction: '冷たい', elapsedTimeType: '数時間後',
      eventFacts: '確認の連絡へ短い返信があった。',
      userResponseType: 'none' as const, userResponseText: null,
    },
  },
};

function withEnv(run: () => Promise<void>) {
  const originalKey = process.env.OPENAI_API_KEY;
  const originalModel = process.env.OPENAI_ANALYSIS_MODEL;
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENAI_ANALYSIS_MODEL = 'test-model';
  return run().finally(() => {
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.OPENAI_ANALYSIS_MODEL;
    else process.env.OPENAI_ANALYSIS_MODEL = originalModel;
  });
}

test('Responses request uses Structured Outputs, store false, and no SDK retry', () => withEnv(async () => {
  const calls: Array<{ body: Record<string, unknown>; options: Record<string, unknown> }> = [];
  const client = {
    parse: async (body: Record<string, unknown>, options: Record<string, unknown>) => {
      calls.push({ body, options });
      return { status: 'completed', output: [], output_parsed: makeValidV2Result() };
    },
  };
  const result = await analyzeMoodV2(input, { client: client as never });
  assert.equal(result.attempts, 1);
  assert.equal(calls[0]?.body.store, false);
  assert.ok(calls[0]?.body.text);
  assert.equal(calls[0]?.options.maxRetries, 0);
}));

test('incomplete responses are retried but never exceed three API sends', () => withEnv(async () => {
  let calls = 0;
  const client = {
    parse: async () => {
      calls += 1;
      return { status: 'incomplete', output: [], output_parsed: null };
    },
  };
  await assert.rejects(
    analyzeMoodV2(input, { client: client as never }),
    (error) => error instanceof AnalyzeMoodV2Error && error.code === 'AI_OUTPUT_INVALID' && error.attempts === 3,
  );
  assert.equal(calls, 3);
}));

test('an explicit refusal is not resent', () => withEnv(async () => {
  let calls = 0;
  const client = {
    parse: async () => {
      calls += 1;
      return {
        status: 'completed', output_parsed: null,
        output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'cannot comply' }] }],
      };
    },
  };
  await assert.rejects(
    analyzeMoodV2(input, { client: client as never }),
    (error) => error instanceof AnalyzeMoodV2Error && error.code === 'AI_REFUSED' && error.attempts === 1,
  );
  assert.equal(calls, 1);
}));
