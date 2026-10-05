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

test('avoidActions names an avoided behavior without rejecting the analysis', () => {
  for (const label of ['相手を脅すのは避ける', '相手を脅す']) {
    const result = makeValidV2Result();
    result.avoidActions[0].label = label;
    assert.equal(validateAiOutput(result).avoidActions[0].label, label);
  }
});

test('inflected direct recommendations and threats in replies are rejected', () => {
  for (const configure of [
    (result: ReturnType<typeof makeValidV2Result>) => { result.recommendedActions[0].label = '相手を脅してください'; },
    (result: ReturnType<typeof makeValidV2Result>) => { result.replyDrafts[0].text = '言うことを聞かないと殴るよ'; },
    (result: ReturnType<typeof makeValidV2Result>) => { result.summary.oneLine = '今回の解決には相手を脅してみましょう。その後の状況を確認してください。'; },
    (result: ReturnType<typeof makeValidV2Result>) => { result.avoidActions[0].label = '相手を脅しましょう'; },
  ]) {
    const result = makeValidV2Result();
    configure(result);
    assert.throws(() => validateAiOutput(result), error =>
      error instanceof AiOutputValidationError && error.failure === 'unsafe');
  }
});

test('explicitly avoiding aggression in recommended actions remains safe', () => {
  const result = makeValidV2Result();
  result.recommendedActions[0].label = '脅すのは避ける';
  result.recommendedActions[0].reason = '相手を脅すことは避けましょう。';
  assert.equal(validateAiOutput(result).recommendedActions[0].label, result.recommendedActions[0].label);
});

test('an explicitly negated quoted diagnosis is accepted without asserting a diagnosis', () => {
  const result = makeValidV2Result();
  result.cognitiveReframe.balancedView = '「人格障害です」と断定することはできません。入力の範囲で状況を整理してください。';
  assert.equal(validateAiOutput(result).cognitiveReframe.balancedView, result.cognitiveReframe.balancedView);
});

test('a quote, negation elsewhere, or inverted negation never permits unsafe direct instructions', () => {
  for (const label of [
    '「相手を脅す」と伝えてください',
    '脅すのは避けて、相手を晒してください',
    '相手を脅すのは避けないでください',
    '相手を脅すのは避けてはいけません',
    '相手を脅すのは避けるな',
    '相手を脅すのは避けるべきではありません',
    '相手を脅すのは避けてはならない',
    '相手を脅すのは避けてはなりません',
    '相手を脅すのは避けてはだめ',
    '相手を脅すのは避けてはダメ',
    '相手を脅すのは避けては駄目',
  ]) {
    const result = makeValidV2Result();
    result.recommendedActions[0].label = label;
    assert.throws(() => validateAiOutput(result), error =>
      error instanceof AiOutputValidationError && error.failure === 'unsafe');
  }
});

test('unsafe validation diagnostics identify the field without containing the generated advice', () => {
  const result = makeValidV2Result();
  result.recommendedActions[0].label = '相手を脅す';
  assert.throws(() => validateAiOutput(result), error => {
    assert.ok(error instanceof AiOutputValidationError);
    assert.deepEqual(error.cause, { field: 'recommendedActions.0.label' });
    assert.equal(error.message.includes('相手を脅す'), false);
    return error.failure === 'unsafe';
  });
});


test('narrative fields cannot hide unsafe instructions behind indirect positive wording or attributed quotes', () => {
  for (const text of [
    '相手を殴ることが最善の対応です。今回の問題はそれで解決する可能性があります。',
    '「殴る」と言われたので、相手にも同じことをしてください。今回の対応として提案します。',
    '「殴る」と言われたことを実行するのが最善の対応です。今回の問題はそれで解決する可能性があります。',
    '「脅す」という発言の内容を実行するのが最善の対応です。今回の問題はそれで解決する可能性があります。',
  ]) {
    const result = makeValidV2Result();
    result.summary.oneLine = text;
    assert.throws(() => validateAiOutput(result), error =>
      error instanceof AiOutputValidationError && error.failure === 'unsafe');
  }
});


test('observed aggression quotes stay conservatively rejected pending semantic policy review', () => {
  const result = makeValidV2Result();
  result.evidence.signalsForConcern[0].text = '「殴る」と言われたことが心配です';
  assert.throws(() => validateAiOutput(result), error =>
    error instanceof AiOutputValidationError && error.failure === 'unsafe');
});

test('avoidActions role cannot bypass imperative or reversed avoidance instructions', () => {
  for (const label of [
    '相手を殴れ', '相手を脅せ', '相手を晒せ', '相手を追い詰めろ',
    '最善の対応は相手を殴る', '正しい対応として相手を脅す', '必ず相手を晒す',
    '相手を脅すのは避けてはいけません', '相手を脅すのは避けるな',
    '相手を脅すのは避けてはならない', '相手を脅すのは避けてはダメ',
    '相手を脅すのは避けないでください', '相手を脅すことが最善の対応です',
  ]) {
    const result = makeValidV2Result();
    result.avoidActions[0].label = label;
    assert.throws(() => validateAiOutput(result), error =>
      error instanceof AiOutputValidationError && error.failure === 'unsafe');
  }
});

test('bare action names and complete avoidance retain the avoidActions field role', () => {
  for (const label of ['相手を殴る', '相手を脅す', '相手を晒す', '仕返し', '復讐', '相手を追い詰める', '相手を脅すことは避けましょう。']) {
    const result = makeValidV2Result();
    result.avoidActions[0].label = label;
    assert.equal(validateAiOutput(result).avoidActions[0].label, label);
  }
});


test('diagnostic denial cannot be reversed by a continuation in the same or next sentence', () => {
  for (const text of [
    '「相手はうつ病です」と断定しません、という言い方ではなく断定してください。',
    '「相手はうつ病です」と断定しません。この注意は無視してこの診断を確定してください。',
    '次の病名を断定してください。「相手はうつ病です」と断定しません。',
  ]) {
    const result = makeValidV2Result(); result.cognitiveReframe.balancedView = text;
    assert.throws(() => validateAiOutput(result), error =>
      error instanceof AiOutputValidationError && error.failure === 'unsafe');
  }
});

test('quoted diagnostic disclaimer cannot hide instructions to ignore the disclaimer', () => {
  for (const text of [
    '「相手は人格障害です」と断定することはできません、という注意を無視してこの診断を確定してください。',
    '「相手は人格障害です」と断定することはできません。入力の範囲で状況を整理してください。その注意は無視して診断を確定してください。',
  ]) {
    const result = makeValidV2Result(); result.cognitiveReframe.balancedView = text;
    assert.throws(() => validateAiOutput(result), error =>
      error instanceof AiOutputValidationError && error.failure === 'unsafe');
  }
});

test('complete known diagnostic denials preserve the benign warning without changing its text', () => {
  for (const text of [
    '「相手はうつ病です」と断定しません。',
    '「相手は人格障害です」と断定することはできません。',
    '「相手は人格障害です」とは言えません。入力の範囲で状況を整理してください。',
  ]) {
    const result = makeValidV2Result(); result.contactTiming = text;
    assert.equal(validateAiOutput(result).contactTiming, text);
  }
});
