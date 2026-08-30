import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EMPTY_CONSULTATION_FORM,
  getConsultationFormErrors,
  resolveReaction,
  resolveRelation,
  resolveUserAction,
} from '../../app/pages/newConsultationModel.js';

test('custom relation, reaction, and chat messages use the submitted text', () => {
  const form = {
    ...EMPTY_CONSULTATION_FORM,
    relation: 'その他' as const,
    relationOther: 'クライアント',
    reaction: 'その他' as const,
    reactionOther: '戸惑っていそう',
  };

  assert.equal(resolveRelation(form), 'クライアント');
  assert.equal(resolveReaction(form), '戸惑っていそう');
  assert.equal(resolveUserAction(form, 'chat', 'LINE', [
    { sender: '自分', text: '確認します' },
    { sender: '相手', text: 'お願いします' },
  ], ''), '自分: 確認します\n相手: お願いします');
});

test('form validation follows the selected response mode', () => {
  const form = { ...EMPTY_CONSULTATION_FORM, personName: 'Aさん', event: '会話' };

  assert.equal(getConsultationFormErrors(form, 'none', 'LINE', [], '').userAction, false);
  assert.equal(getConsultationFormErrors(form, 'chat', 'LINE', [], '').chatContent, true);
  assert.equal(getConsultationFormErrors(form, 'chat', 'other', [], '貼り付け').chatContent, false);
});
