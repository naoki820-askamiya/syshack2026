import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeAnalysis } from '../../app/utils/analysisViewModel.js';

test('v2 integer scores do not treat 0 or 1 as legacy probability values', () => {
  const scores = Object.fromEntries(
    ['anger', 'coldness', 'distance', 'busyness', 'flatness', 'reassurance'].map((key, index) => [
      key,
      { label: key, score: [1, 0, 100, 2, 3, 4][index], category: 'concern', reason: 'test reason' },
    ]),
  );
  const view = normalizeAnalysis({
    result: {
      id: 'result-id',
      resultSchemaVersion: 'kigen-analysis-result-v2',
      analysis: {
        confidenceLevel: 'medium',
        emotionScoreAnalysis: { scores },
      },
    },
  });

  assert.deepEqual(view?.scores.slice(0, 3).map((score) => score.score), [1, 0, 100]);
});

test('legacy decimal scores are still converted to a 0-100 display value', () => {
  const view = normalizeAnalysis({
    result: {
      scores: {
        angry: 0.4, cold: 0.5, busy: 0.6, pressure: 0.7,
        distance: 0.8, happy: 0.9, joy: 1, relief: 0,
      },
    },
  });

  assert.equal(view?.scores[0]?.score, 40);
  assert.equal(view?.scores[6]?.score, 100);
});
