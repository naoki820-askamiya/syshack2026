import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { analyzeMoodV2 } from './analyzeMood.js';
import { aiAnalysisInputSchema } from './input.schema.js';
import { makeValidV2Result } from './testFixture.js';
import { kigenAnalysisResultV2Schema } from './output.schema.js';

const dataset = JSON.parse(readFileSync('experiments/crisis-routing/fixtures.json', 'utf8')) as {
  mode: string; labelsAreRoutingPolicy: boolean;
  fixtures: Array<{ id: string; domain: string; synthetic: boolean; input: unknown }>;
};

test('C01 fixture matrix covers eight review domains and over-routing controls without adopting a policy', () => {
  assert.equal(dataset.mode, 'PROPOSAL_ONLY_SYNTHETIC');
  assert.equal(dataset.labelsAreRoutingPolicy, false);
  assert.equal(dataset.fixtures.length, 14);
  assert.equal(new Set(dataset.fixtures.map(value => value.id)).size, 14);
  for (const domain of ['DV', 'self_harm', 'harm_to_others', 'violence', 'stalking', 'abuse', 'threat', 'harassment']) {
    assert.ok(dataset.fixtures.some(value => value.domain === domain), domain);
  }
  for (const fixture of dataset.fixtures) {
    assert.equal(fixture.synthetic, true);
    aiAnalysisInputSchema.parse(fixture.input);
  }
});

test('current AI entrypoint sends every crisis/control fixture to the injected normal-analysis client', async () => {
  const originalKey = process.env.OPENAI_API_KEY;
  const originalModel = process.env.OPENAI_ANALYSIS_MODEL;
  process.env.OPENAI_API_KEY = 'synthetic-fixture-only-key';
  process.env.OPENAI_ANALYSIS_MODEL = 'synthetic-fixture-only-model';
  try {
    for (const fixture of dataset.fixtures) {
      let calls = 0;
      const client = { parse: async (body: { store?: boolean }) => {
        calls++;
        assert.equal(body.store, false);
        return { status: 'completed', output: [], output_parsed: makeValidV2Result() };
      } };
      const result = await analyzeMoodV2(aiAnalysisInputSchema.parse(fixture.input), { client: client as never });
      assert.equal(calls, 1, fixture.id + ': no pre-provider crisis routing exists at this entrypoint');
      assert.equal(result.attempts, 1);
      assert.equal(result.model, 'synthetic-fixture-only-model');
      // The fixed mock output demonstrates accepted normal schema, not safe advice or real model quality.
      kigenAnalysisResultV2Schema.parse(result.analysis);
      assert.equal(result.analysis.summary.oneLine, makeValidV2Result().summary.oneLine);
    }
  } finally {
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.OPENAI_ANALYSIS_MODEL;
    else process.env.OPENAI_ANALYSIS_MODEL = originalModel;
  }
});
