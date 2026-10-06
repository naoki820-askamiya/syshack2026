import assert from 'node:assert/strict';
import OpenAI from 'openai';
import test from 'node:test';
import { analyzeMoodV2, AnalyzeMoodV2Error, type AiAttemptMetrics } from './analyzeMood.js';
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

test('permanent provider errors and explicit aborts are never resent', () => withEnv(async () => {
  for (const failure of [
    ...[400, 401, 403, 404, 422, 501].map(status => new OpenAI.APIError(status, {}, 'test error', {})),
    new OpenAI.APIUserAbortError(),
    Object.assign(new Error('cancelled'), { name: 'AbortError' }),
    new Error('local configuration error'),
  ]) {
    let calls = 0;
    const client = { parse: async () => { calls += 1; throw failure; } };
    await assert.rejects(analyzeMoodV2(input, { client: client as never }));
    assert.equal(calls, 1, failure.name + ' must not be resent');
  }
}));

test('an already aborted signal sends no provider request', () => withEnv(async () => {
  let calls = 0;
  const controller = new AbortController();
  controller.abort();
  const client = { parse: async () => { calls += 1; return { status: 'completed', output: [], output_parsed: makeValidV2Result() }; } };
  await assert.rejects(analyzeMoodV2(input, { client: client as never, signal: controller.signal }));
  assert.equal(calls, 0);
}));

test('transient network and selected HTTP failures retry with distinct signals', () => withEnv(async () => {
  for (const failure of [
    new OpenAI.APIConnectionError({ message: 'transient network' }),
    new OpenAI.APIConnectionTimeoutError(),
    ...[408, 429, 500, 502, 503, 504].map(status => new OpenAI.APIError(status, {}, 'test transient', {})),
  ]) {
    const signals: AbortSignal[] = [];
    const client = { parse: async (_body: unknown, options: { signal: AbortSignal }) => {
      signals.push(options.signal);
      if (signals.length === 1) throw failure;
      return { status: 'completed', output: [], output_parsed: makeValidV2Result() };
    } };
    const result = await analyzeMoodV2(input, { client: client as never, timeoutMs: 2_000 });
    assert.equal(result.attempts, 2);
    assert.equal(signals.length, 2);
    assert.notEqual(signals[0], signals[1]);
    assert.equal(signals[1]?.aborted, false);
  }
}));

test('Retry-After is respected but never extends the total deadline', () => withEnv(async () => {
  let calls = 0;
  const client = { parse: async () => {
    calls += 1;
    throw new OpenAI.APIError(429, {}, 'rate limited', { 'retry-after': '1' });
  } };
  const start = Date.now();
  await assert.rejects(analyzeMoodV2(input, { client: client as never, timeoutMs: 50 }),
    error => error instanceof AnalyzeMoodV2Error && error.code === 'AI_TIMEOUT' && error.attempts === 1);
  assert.equal(calls, 1);
  assert.ok(Date.now() - start < 500);
}));

test('a total deadline aborts a pending provider attempt instead of starting another', () => withEnv(async () => {
  let calls = 0;
  let aborted = false;
  const client = { parse: async (_body: unknown, options: { signal: AbortSignal }) => {
    calls += 1;
    return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => {
      aborted = true;
      reject(new OpenAI.APIUserAbortError());
    }, { once: true }));
  } };
  await assert.rejects(analyzeMoodV2(input, { client: client as never, timeoutMs: 25 }),
    error => error instanceof AnalyzeMoodV2Error && error.code === 'AI_TIMEOUT');
  assert.equal(calls, 1);
  assert.equal(aborted, true);
}));


test('Retry-After delays a transient resend and backoff grows between attempts', () => withEnv(async () => {
  const sends: number[] = [];
  const timeouts: number[] = [];
  const client = { parse: async (_body: unknown, options: { timeout: number }) => {
    sends.push(Date.now());
    timeouts.push(options.timeout);
    if (sends.length === 1) throw new OpenAI.APIError(429, {}, 'rate limited', { 'retry-after-ms': '350' });
    if (sends.length === 2) throw new OpenAI.APIError(503, {}, 'unavailable', { 'retry-after': 'invalid' });
    return { status: 'completed', output: [], output_parsed: makeValidV2Result() };
  } };
  const result = await analyzeMoodV2(input, { client: client as never, timeoutMs: 2_000 });
  assert.equal(result.attempts, 3);
  assert.ok(sends[1]! - sends[0]! >= 340);
  assert.ok(sends[2]! - sends[1]! >= 490);
  assert.ok(timeouts[2]! < timeouts[1]! && timeouts[1]! < timeouts[0]!);
}));

test('cancellation while waiting for retry never resends', () => withEnv(async () => {
  let calls = 0;
  const controller = new AbortController();
  const client = { parse: async () => {
    calls += 1;
    setTimeout(() => controller.abort(), 10);
    throw new OpenAI.APIConnectionError({ message: 'temporary network' });
  } };
  await assert.rejects(analyzeMoodV2(input, { client: client as never, signal: controller.signal }),
    error => error instanceof AnalyzeMoodV2Error && error.code === 'AI_TIMEOUT' && error.attempts === 1);
  assert.equal(calls, 1);
}));

test('invalid input fails before a provider send without provider-error classification', () => withEnv(async () => {
  let calls = 0;
  const client = { parse: async () => { calls += 1; throw new Error('must not send'); } };
  const invalid = { ...input, untrustedUserInput: { ...input.untrustedUserInput,
    currentCase: { ...input.untrustedUserInput.currentCase, eventFacts: '' } } };
  await assert.rejects(analyzeMoodV2(invalid, { client: client as never }),
    error => !(error instanceof AnalyzeMoodV2Error));
  assert.equal(calls, 0);
}));


test('a result arriving after the total deadline is not accepted even before timer dispatch', () => withEnv(async () => {
  let calls = 0;
  const client = { parse: async () => {
    calls += 1;
    const start = performance.now();
    while (performance.now() - start < 30) { /* Simulate a blocked event loop before timer dispatch. */ }
    return { status: 'completed', output: [], output_parsed: makeValidV2Result() };
  } };
  await assert.rejects(analyzeMoodV2(input, { client: client as never, timeoutMs: 10 }),
    error => error instanceof AnalyzeMoodV2Error && error.code === 'AI_TIMEOUT' && error.attempts === 1);
  assert.equal(calls, 1);
}));

test('an expired zero deadline sends no provider request', () => withEnv(async () => {
  let calls = 0;
  const client = { parse: async () => { calls += 1; throw new Error('must not send'); } };
  await assert.rejects(analyzeMoodV2(input, { client: client as never, timeoutMs: 0 }),
    error => error instanceof AnalyzeMoodV2Error && error.code === 'AI_TIMEOUT' && error.attempts === 0);
  assert.equal(calls, 0);
}));

test('installed SDK accepts the remaining timeout and reaches injected fetch without real network', () => withEnv(async () => {
  let fetchCalls = 0;
  const sdk = new OpenAI({
    apiKey: 'synthetic-no-network', baseURL: 'http://127.0.0.1:9/synthetic', maxRetries: 0,
    fetch: (async (_url: unknown, init: { body?: unknown }) => {
      fetchCalls += 1;
      const body = JSON.parse(String(init.body));
      assert.equal(body.store, false);
      assert.equal(body.text.format.type, 'json_schema');
      return new Response(JSON.stringify({
        id: 'resp_synthetic', object: 'response', created_at: 0, model: 'test-model',
        status: 'completed', output: [{
          type: 'message', id: 'msg_synthetic', status: 'completed', role: 'assistant',
          content: [{ type: 'output_text', annotations: [], text: JSON.stringify(makeValidV2Result()) }],
        }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as never,
  });
  const result = await analyzeMoodV2(input, { client: sdk.responses, timeoutMs: 2_000.5 });
  assert.equal(fetchCalls, 1);
  assert.equal(result.attempts, 1);
  assert.equal(result.model, 'test-model');
  assert.equal(result.analysis.disclaimer.notDiagnosis, true);
}));


test('attempt metrics preserve actual SDK usage without input, output, or provider objects', () => withEnv(async () => {
  const secret = 'SYNTHETIC_PRIVATE_METRICS_DO_NOT_LOG';
  const metrics: AiAttemptMetrics[] = [];
  const sdk = new OpenAI({
    apiKey: 'synthetic-no-network', baseURL: 'http://127.0.0.1:9/synthetic', maxRetries: 0,
    fetch: (async () => {
      const analysis = makeValidV2Result();
      analysis.summary.oneLine = secret;
      return new Response(JSON.stringify({
        id: secret, object: 'response', created_at: 0, model: 'test-model', status: 'completed',
        usage: { input_tokens: 23, output_tokens: 17, total_tokens: 40,
          input_tokens_details: { cached_tokens: 3 }, output_tokens_details: { reasoning_tokens: 5 } },
        output: [{ type: 'message', id: secret, status: 'completed', role: 'assistant',
          content: [{ type: 'output_text', annotations: [], text: JSON.stringify(analysis) }] }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as never,
  });
  const result = await analyzeMoodV2(input, { client: sdk.responses,
    onAttemptMetrics: (metric) => { metrics.push(metric); } });
  assert.equal(result.analysis.summary.oneLine, secret);
  assert.equal(metrics.length, 1);
  assert.equal(metrics[0].outcome, 'succeeded');
  assert.equal(metrics[0].failureCode, null);
  assert.deepEqual(metrics[0].usage, { input_tokens: 23, output_tokens: 17, total_tokens: 40,
    cached_tokens: 3, reasoning_tokens: 5 });
  for (const value of Object.values(metrics[0].duration)) assert.ok(Number.isFinite(value) && (value as number) >= 0);
  assert.equal(JSON.stringify(metrics).includes(secret), false);
  assert.equal(JSON.stringify(metrics).includes('test-key'), false);
}));

test('retry emits one metric per completed attempt and preserves rejected-output usage', () => withEnv(async () => {
  const metrics: AiAttemptMetrics[] = [];
  let sends = 0;
  const client = { parse: async () => {
    sends += 1;
    return { status: 'completed', output: [], output_parsed: sends === 1 ? {} : makeValidV2Result(),
      usage: { input_tokens: 10 * sends, output_tokens: 4, total_tokens: 10 * sends + 4,
        input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } };
  } };
  const result = await analyzeMoodV2(input, { client: client as never,
    onAttemptMetrics: (metric) => { metrics.push(metric); } });
  assert.equal(result.attempts, 2);
  assert.deepEqual(metrics.map(metric => [metric.attempt, metric.outcome, metric.failureCode]),
    [[1, 'failed', 'AI_OUTPUT_INVALID'], [2, 'succeeded', null]]);
  assert.equal(metrics[0].usage.input_tokens, 10);
  assert.equal(metrics[1].usage.input_tokens, 20);
  assert.ok(metrics.every(metric => metric.duration.validation_ms !== null));
}));

test('refusal has observed completion but no local validation; missing or malformed usage remains unknown', () => withEnv(async () => {
  for (const usage of [undefined, { input_tokens: -1, output_tokens: Infinity, total_tokens: '10',
    input_tokens_details: { cached_tokens: 2.5 }, output_tokens_details: { reasoning_tokens: NaN } }]) {
    const metrics: AiAttemptMetrics[] = [];
    const client = { parse: async () => ({ status: 'completed', usage, output_parsed: null,
      output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'synthetic refusal' }] }] }) };
    await assert.rejects(analyzeMoodV2(input, { client: client as never,
      onAttemptMetrics: (metric) => { metrics.push(metric); } }),
      error => error instanceof AnalyzeMoodV2Error && error.code === 'AI_REFUSED' && error.attempts === 1);
    assert.equal(metrics.length, 1);
    assert.equal(metrics[0].failureCode, 'AI_REFUSED');
    assert.ok(metrics[0].duration.provider_complete_ms! >= 0);
    assert.equal(metrics[0].duration.validation_ms, null);
    assert.deepEqual(metrics[0].usage, { input_tokens: null, output_tokens: null, total_tokens: null,
      cached_tokens: null, reasoning_tokens: null });
  }
}));

test('timeout observes request lifetime without inventing provider completion or token usage', () => withEnv(async () => {
  const metrics: AiAttemptMetrics[] = [];
  const client = { parse: async () => new Promise(() => {}) };
  await assert.rejects(analyzeMoodV2(input, { client: client as never, timeoutMs: 20,
    onAttemptMetrics: (metric) => { metrics.push(metric); } }),
    error => error instanceof AnalyzeMoodV2Error && error.code === 'AI_TIMEOUT' && error.attempts === 1);
  assert.equal(metrics.length, 1);
  assert.ok(metrics[0].duration.provider_request_ms! >= 0);
  assert.equal(metrics[0].duration.provider_complete_ms, null);
  assert.equal(metrics[0].duration.validation_ms, null);
  assert.equal(metrics[0].usage.total_tokens, null);
}));

test('metrics observer exceptions cannot change retries, accepted result, or original failure', () => withEnv(async () => {
  let sends = 0;
  const observer = () => { throw new Error('SYNTHETIC_MONITOR_FAILURE'); };
  const client = { parse: async () => {
    sends += 1;
    if (sends === 1) throw new OpenAI.APIError(503, {}, 'synthetic provider error', {});
    return { status: 'completed', output: [], output_parsed: makeValidV2Result() };
  } };
  const result = await analyzeMoodV2(input, { client: client as never, onAttemptMetrics: observer });
  assert.equal(sends, 2);
  assert.equal(result.attempts, 2);
  const permanent = { parse: async () => { throw new OpenAI.APIError(403, {}, 'synthetic denied', {}); } };
  await assert.rejects(analyzeMoodV2(input, { client: permanent as never, onAttemptMetrics: observer }),
    error => error instanceof AnalyzeMoodV2Error && error.code === 'AI_PROVIDER_ERROR' && error.attempts === 1);
}));


test('async metrics observer rejection is isolated without awaiting monitoring', () => withEnv(async () => {
  const client = { parse: async () => ({ status: 'completed', output: [], output_parsed: makeValidV2Result() }) };
  const result = await analyzeMoodV2(input, { client: client as never,
    onAttemptMetrics: async () => { throw new Error('SYNTHETIC_ASYNC_MONITOR_FAILURE'); } });
  assert.equal(result.attempts, 1);
  await new Promise(resolve => setImmediate(resolve));
}));


test('late fulfillment after timeout cannot publish completion or usage retroactively', () => withEnv(async () => {
  const metrics: AiAttemptMetrics[] = [];
  let release!: (value: unknown) => void;
  const client = { parse: async () => new Promise(resolve => { release = resolve; }) };
  await assert.rejects(analyzeMoodV2(input, { client: client as never, timeoutMs: 20,
    onAttemptMetrics: metric => { metrics.push(metric); } }),
    error => error instanceof AnalyzeMoodV2Error && error.code === 'AI_TIMEOUT');
  release({ status: 'completed', output: [], output_parsed: makeValidV2Result(),
    usage: { input_tokens: 9, output_tokens: 9, total_tokens: 18 } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(metrics.length, 1);
  assert.equal(metrics[0].duration.provider_complete_ms, null);
  assert.equal(metrics[0].usage.total_tokens, null);
}));
