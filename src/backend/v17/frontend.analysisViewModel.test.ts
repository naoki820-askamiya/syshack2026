import assert from 'node:assert/strict';
import test from 'node:test';
import { actionSafetyLabel, normalizeAnalysis } from '../../app/utils/analysisViewModel.js';

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


test('action safety survives normalization, including unknown and legacy safety', () => {
  const scores = Object.fromEntries(['anger', 'coldness', 'distance', 'busyness', 'flatness', 'reassurance']
    .map((key) => [key, { label: key, score: 10, category: 'concern', reason: 'fixture' }]));
  const view = normalizeAnalysis({ result: { analysis: {
    emotionScoreAnalysis: { scores },
    recommendedActions: [
      { label: '少し待つ', reason: '急ぐ必要がない', safety: 'safe' },
      { label: '関係性に応じて確認', reason: '状況に注意', safety: 'caution' },
      { label: '情報不足', reason: '', safety: 'unsupported' },
      { label: '欠損', reason: '' },
    ],
  } } });
  assert.deepEqual(view?.recommendedActions.map((action) => action.safety), ['safe', 'caution', 'unknown', 'unknown']);
  const legacy = normalizeAnalysis({ result: { scores: {}, actions: [{ text: '旧提案' }] } });
  assert.equal(legacy?.recommendedActions[0]?.safety, 'unknown');
});


test('safe, caution and unknown action labels are distinguishable without color', () => {
  const labels = ['safe', 'caution', 'unknown'].map((safety) => actionSafetyLabel(safety as 'safe' | 'caution' | 'unknown'));
  assert.equal(new Set(labels).size, 3);
  assert.match(labels[1], /注意/);
  assert.match(labels[2], /情報なし/);
});
