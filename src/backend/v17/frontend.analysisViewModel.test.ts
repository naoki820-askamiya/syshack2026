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

function detailFixture() {
  const scores = Object.fromEntries(['anger', 'coldness', 'distance', 'busyness', 'flatness', 'reassurance']
    .map(key => [key, { label: key, score: 20, category: ['busyness', 'flatness'].includes(key) ? 'context' : key === 'reassurance' ? 'relief' : 'concern', reason: 'synthetic reason' }]));
  return { result: { analysis: { emotionScoreAnalysis: { scores },
    evidence: {
      signalsForConcern: [{ text: '今回の材料', source: 'current_case', strength: 'low' }],
      signalsAgainstConcern: [{ text: '過去AIの見方', source: 'recent_case', strength: 'high' }, { text: '本人の後日報告', source: 'feedback', strength: 'medium' }],
      unknowns: ['まだ未確認'],
    },
    usualVsCurrent: { enabled: true, comparisonConclusion: '同じ点と違う点を検討する',
      usualPatternsUsed: [{ label: '過去の短文', source: 'person_profile', relevance: 'medium' }],
      sameAsUsual: [{ label: '今回も短文', reason: '同じ長さという入力材料がある' }],
      deviationSignals: [{ label: '確認がない', reason: '今回の入力では確認が省略されている', strength: 'low' }],
    },
  } } };
}

test('score context categories survive rather than becoming concern', () => {
  const view = normalizeAnalysis(detailFixture())!;
  assert.deepEqual(view.scores.map(item => item.category), ['concern', 'concern', 'concern', 'context', 'context', 'reassurance']);
});

test('evidence retains its source and AI-rated strength', () => {
  const view = normalizeAnalysis(detailFixture())!;
  assert.deepEqual(view.concernSignals, [{ text: '今回の材料', source: 'current_case', strength: 'low' }]);
  assert.deepEqual(view.reassuringSignals, [
    { text: '過去AIの見方', source: 'recent_case', strength: 'high' },
    { text: '本人の後日報告', source: 'feedback', strength: 'medium' },
  ]);
});

test('usual comparison preserves same points, reasons and source relevance', () => {
  const view = normalizeAnalysis(detailFixture())!;
  assert.deepEqual(view.contextComparison, { enabled: true, conclusion: '同じ点と違う点を検討する',
    patterns: [{ label: '過去の短文', source: 'person_profile', relevance: 'medium' }],
    sameAsUsual: [{ label: '今回も短文', reason: '同じ長さという入力材料がある' }],
    deviations: [{ label: '確認がない', reason: '今回の入力では確認が省略されている', strength: 'low' }],
  });
});

test('legacy and missing metadata remain unknown instead of gaining invented provenance', () => {
  const legacy = normalizeAnalysis({ result: { scores: {}, reasons: [{ label: '旧項目', detail: '旧説明' }], goodSignals: [{ text: '旧材料' }] } })!;
  assert.equal((legacy.concernSignals[0] as any).source, 'unknown');
  assert.equal((legacy.reassuringSignals[0] as any).strength, 'unknown');
  assert.deepEqual((legacy.contextComparison as any).sameAsUsual, []);
  const fixture: any = detailFixture();
  fixture.result.analysis.evidence.signalsForConcern = [{ text: '欠損' }, { text: '不明値', source: 'future', strength: 'definite' }];
  assert.deepEqual(normalizeAnalysis(fixture)!.concernSignals, [
    { text: '欠損', source: 'unknown', strength: 'unknown' },
    { text: '不明値', source: 'unknown', strength: 'unknown' },
  ]);
});

test('disabled comparison omits leftover comparison details', () => {
  const fixture: any = detailFixture();
  fixture.result.analysis.usualVsCurrent.enabled = false;
  const view = normalizeAnalysis(fixture)!;
  assert.deepEqual(view.contextComparison.patterns, []);
  assert.deepEqual((view.contextComparison as any).sameAsUsual, []);
  assert.deepEqual(view.contextComparison.deviations, []);
});

test('missing or invalid confidence is unknown, while explicit medium is retained', () => {
  assert.equal(normalizeAnalysis({ result: { scores: {} } })!.confidenceLevel, 'unknown');
  for (const value of [undefined, null, 'definite', 'medium']) {
    const fixture: any = detailFixture(); fixture.result.analysis.confidenceLevel = value;
    assert.equal(normalizeAnalysis(fixture)!.confidenceLevel, value === 'medium' ? 'medium' : 'unknown');
  }
});
