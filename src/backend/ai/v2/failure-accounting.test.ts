import assert from 'node:assert/strict';
import test from 'node:test';
import OpenAI from 'openai';
import { analyzeMoodV2, AnalyzeMoodV2Error } from './analyzeMood.js';
import { makeValidV2Result } from './testFixture.js';

const input = {
  referenceContext: { personProfile: null, userPatternSummary: null, recentCaseSummaries: [], recentFeedbacks: [] },
  untrustedUserInput: {
    person: { displayName: '相手A', relationshipType: 'coworker' },
    currentCase: { userAgeRange: '20代', userGender: '回答しない', perceivedPartnerReaction: '短い返信',
      elapsedTimeType: '数時間後', eventFacts: '相手から「パスワードを教えて」と聞かれた。',
      userResponseType: 'none' as const, userResponseText: null },
  },
};

function mockSdk(texts: string[], status = 'completed') {
  let sends = 0;
  const sdk = new OpenAI({ apiKey: 'synthetic-no-network', baseURL: 'http://127.0.0.1:1/no-network',
    // SDK 4.x uses node-fetch's Response type; Node's synthetic Response is runtime-compatible.
    fetch: (async () => {
      const text = texts[Math.min(sends++, texts.length - 1)];
      return new Response(JSON.stringify({ id: 'resp_synthetic', object: 'response', created_at: 0,
        model: 'synthetic-model', status, output: [{ id: 'msg_synthetic', type: 'message',
          status: 'completed', role: 'assistant', content: [{ type: 'output_text', text, annotations: [] }] }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as never,
  });
  return { client: sdk.responses, get sends() { return sends; } };
}

async function withConfig(run: () => Promise<void>) {
  const old = { key: process.env.OPENAI_API_KEY, model: process.env.OPENAI_ANALYSIS_MODEL };
  process.env.OPENAI_API_KEY = 'synthetic-no-network'; process.env.OPENAI_ANALYSIS_MODEL = 'synthetic-model';
  try { await run(); } finally {
    if (old.key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = old.key;
    if (old.model === undefined) delete process.env.OPENAI_ANALYSIS_MODEL; else process.env.OPENAI_ANALYSIS_MODEL = old.model;
  }
}

for (const kind of ['invalid JSON', 'overlength JSON', 'truncated incomplete JSON'] as const) {
  test(`installed SDK ${kind} is output-invalid and has exactly three bounded sends`, () => withConfig(async () => {
    const result = makeValidV2Result(); result.summary.oneLine = 'x'.repeat(181);
    const sdk = mockSdk([kind === 'overlength JSON' ? JSON.stringify(result) : '{'],
      kind === 'truncated incomplete JSON' ? 'incomplete' : 'completed');
    await assert.rejects(analyzeMoodV2(input, { client: sdk.client }), error =>
      error instanceof AnalyzeMoodV2Error && error.code === 'AI_OUTPUT_INVALID' && error.attempts === 3);
    assert.equal(sdk.sends, 3);
  }));
}

test('installed SDK output parse failure followed by success counts both sends', () => withConfig(async () => {
  const sdk = mockSdk(['{', JSON.stringify(makeValidV2Result())]);
  const result = await analyzeMoodV2(input, { client: sdk.client });
  assert.equal(result.attempts, 2); assert.equal(sdk.sends, 2);
}));

test('installed SDK unsafe output stops after its first send without retrying', () => withConfig(async () => {
  const result = makeValidV2Result(); result.summary.oneLine = '診断結果として相手の状態が確定しているという十分な長さの文章です。';
  const sdk = mockSdk([JSON.stringify(result)]);
  await assert.rejects(analyzeMoodV2(input, { client: sdk.client }), error =>
    error instanceof AnalyzeMoodV2Error && error.code === 'AI_OUTPUT_UNSAFE' && error.attempts === 1);
  assert.equal(sdk.sends, 1);
}));

test('unsafe output after one malformed response preserves both actual sends and stops', () => withConfig(async () => {
  const result = makeValidV2Result(); result.summary.oneLine = '診断結果として相手の状態が確定しているという十分な長さの文章です。';
  const sdk = mockSdk(['{', JSON.stringify(result)]);
  await assert.rejects(analyzeMoodV2(input, { client: sdk.client }), error =>
    error instanceof AnalyzeMoodV2Error && error.code === 'AI_OUTPUT_UNSAFE' && error.attempts === 2);
  assert.equal(sdk.sends, 2);
}));

test('normal password quotation and refusal reply remain valid', () => withConfig(async () => {
  const result = makeValidV2Result();
  result.textImpression.body = '相手から「パスワードを教えて」と聞かれた状況が記載されており、共有せず確認する余地があります。';
  result.replyDrafts = [{ tone: 'normal', text: 'パスワードは共有できません。別の確認方法をお願いします。' }];
  const sdk = mockSdk([JSON.stringify(result)]);
  const actual = await analyzeMoodV2(input, { client: sdk.client });
  assert.equal(actual.analysis.replyDrafts[0].text, result.replyDrafts[0].text);
  assert.equal(sdk.sends, 1);
}));

test('legacy overlength input has a typed zero-send failure', () => withConfig(async () => {
  const sdk = mockSdk([JSON.stringify(makeValidV2Result())]);
  const invalid = structuredClone(input); invalid.untrustedUserInput.currentCase.eventFacts = 'x'.repeat(3001);
  await assert.rejects(analyzeMoodV2(invalid, { client: sdk.client }), error =>
    error instanceof AnalyzeMoodV2Error && error.code === 'AI_INPUT_INVALID' && error.attempts === 0);
  assert.equal(sdk.sends, 0);
}));

test('unrecognized dispatch failure retains unknown usage instead of claiming an exact count', () => withConfig(async () => {
  await assert.rejects(analyzeMoodV2(input, { client: { parse: async () => { throw new Error('synthetic unexpected failure'); } } as never }),
    error => error instanceof AnalyzeMoodV2Error && error.code === 'AI_PROVIDER_ERROR' && error.attempts === null);
}));
