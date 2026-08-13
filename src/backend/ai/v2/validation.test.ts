import assert from 'node:assert/strict';
import test from 'node:test';
import { createAnalysisCaseSchema } from '../../v17/schemas.js';
import { kigenAnalysisResultV2Schema } from './output.schema.js';
import { AiOutputValidationError, validateAiOutput } from './validation.js';

function validResult() {
  return {
    confidenceLevel: 'medium',
    summary: { oneLine: '入力された情報だけでは、相手の感情を一つに決めることはできません。' },
    textImpression: { body: '短い返答ですが、怒りを直接示す表現は確認できません。' },
    situationReading: { body: '忙しさなど複数の説明があり、現時点では確認が必要です。' },
    emotionScoreAnalysis: {
      description: '入力された事実をもとにした相対的なスコアです。',
      scores: {
        anger: { label: '怒り気味', score: 40, category: 'concern', reason: '明確な怒りの言葉はない一方、返答が短いためです。' },
        coldness: { label: '冷たい', score: 55, category: 'concern', reason: '普段との比較はできませんが、返答が短いためです。' },
        distance: { label: '距離あり', score: 45, category: 'concern', reason: '会話を切り上げた可能性があるためです。' },
        busyness: { label: '忙しい', score: 65, category: 'context', reason: '返信に時間がかかっているためです。' },
        flatness: { label: '淡々', score: 60, category: 'context', reason: '返答に補足がなく短いためです。' },
        reassurance: { label: '大丈夫', score: 35, category: 'relief', reason: '拒絶や非難を示す明確な言葉はないためです。' },
      },
    },
    evidence: {
      signalsForConcern: [{ text: '返答が短い', source: 'current_case', strength: 'medium' }],
      signalsAgainstConcern: [{ text: '拒絶の言葉はない', source: 'current_case', strength: 'medium' }],
      unknowns: ['普段の返信速度は不明です'],
    },
    alternativeInterpretations: [{ label: '忙しかった', reason: '作業中で短い返答になった可能性があります。' }],
    cognitiveReframe: {
      possibleBiases: [{ label: '悪い方向への先読み', basis: '短い返答だけで怒りと結びつけています。' }],
      balancedView: '冷たく感じる要素はありますが、怒り以外の説明も残っています。',
    },
    recommendedActions: [{ label: '少し待つ', actionType: 'wait', safety: 'safe', reason: '追加情報を待てるためです。' }],
    avoidActions: [{ label: '感情を決めつける', reason: '確認できていないためです。' }],
    replyDrafts: [{ tone: 'normal', text: '忙しいところごめんね。落ち着いたら確認してもらえると助かります。' }],
    contactTiming: '急ぎでなければ少し時間を置いてから連絡する案があります。',
    usualVsCurrent: {
      enabled: false,
      usualPatternsUsed: [], sameAsUsual: [], deviationSignals: [],
      comparisonConclusion: '普段の傾向を判断できる情報が不足しています。',
    },
    disclaimer: { notDiagnosis: true, text: 'この分析は診断や感情の断定ではなく、状況整理の参考情報です。' },
  };
}

test('v2 result accepts the fixed six-score contract', () => {
  assert.equal(kigenAnalysisResultV2Schema.parse(validResult()).emotionScoreAnalysis.scores.anger.score, 40);
});

test('v2 result rejects a probability-like decimal and a changed fixed label', () => {
  const result = validResult();
  result.emotionScoreAnalysis.scores.anger.score = 0.4;
  result.emotionScoreAnalysis.scores.anger.label = '怒っている確率';
  assert.equal(kigenAnalysisResultV2Schema.safeParse(result).success, false);
});

test('unsafe definitive wording is rejected after schema validation', () => {
  const result = validResult();
  result.summary.oneLine = '絶対に相手は怒っているので、すぐに謝罪するべき状況です。';
  assert.throws(() => validateAiOutput(result), (error) =>
    error instanceof AiOutputValidationError && error.failure === 'unsafe');
});

test('minor definitive wording is softened without changing the object shape', () => {
  const result = validResult();
  result.textImpression.body = '相手は怒っていますが、理由までは入力情報から判断できません。';
  assert.match(validateAiOutput(result).textImpression.body, /可能性があります/);
});

test('analysis case enforces the none/null pair and rejects unknown userId', () => {
  const base = {
    personId: 'b8ced96d-0056-4b61-929c-ecaca87690e4',
    userAgeRange: '20代', userGender: '回答しない',
    perceivedPartnerReaction: '冷たい', elapsedTimeType: '数時間後',
    eventFacts: '予定の確認を送ったところ、短い返事が来た。',
    userResponseType: 'none', userResponseText: null,
  };
  assert.equal(createAnalysisCaseSchema.safeParse(base).success, true);
  assert.equal(createAnalysisCaseSchema.safeParse({ ...base, userResponseText: '返信した' }).success, false);
  assert.equal(createAnalysisCaseSchema.safeParse({ ...base, userId: 'forbidden' }).success, false);
});
