import assert from 'node:assert/strict';
import test from 'node:test';
import { makeValidV2Result } from './testFixture.js';
import { AiOutputValidationError, validateAiOutput } from './validation.js';

test('aggressive recommendations are rejected instead of mechanically softened', () => {
  const result = makeValidV2Result();
  result.recommendedActions[0].label = '相手を脅す';
  assert.throws(
    () => validateAiOutput(result),
    (error) => error instanceof AiOutputValidationError && error.failure === 'unsafe',
  );
});

test('diagnostic assertions are rejected', () => {
  const result = makeValidV2Result();
  result.situationReading.body = '相手は人格障害です。入力された態度だけで明確に判断できます。';
  assert.throws(
    () => validateAiOutput(result),
    (error) => error instanceof AiOutputValidationError && error.failure === 'unsafe',
  );
});
