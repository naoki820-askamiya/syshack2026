import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EMPTY_CONSULTATION_FORM,
  ERROR_FIELD_ELEMENT_IDS,
  getConsultationFormErrors,
  getFirstErrorField,
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

test('new Other still requires detail but selected Person uses its authoritative enum', () => {
  const form = { ...EMPTY_CONSULTATION_FORM, relation: 'その他' as const };
  assert.equal(getConsultationFormErrors(form, 'none', 'LINE', [], '').relationOther, true);
  assert.equal(getConsultationFormErrors({ ...form, personId: 'owned-person' }, 'none', 'LINE', [], '').relationOther, false);
});

test('getFirstErrorField prioritizes fields in visual document order and maps to DOM IDs', () => {
  assert.equal(getFirstErrorField({
    personName: false,
    event: false,
    relationOther: false,
    reactionOther: false,
    userAction: false,
    chatContent: false,
  }), null);

  assert.equal(getFirstErrorField({
    personName: true,
    event: true,
    relationOther: false,
    reactionOther: false,
    userAction: true,
    chatContent: false,
  }), 'personName');

  assert.equal(getFirstErrorField({
    personName: false,
    relationOther: true,
    event: true,
    reactionOther: false,
    userAction: false,
    chatContent: false,
  }), 'relationOther');

  assert.equal(getFirstErrorField({
    personName: false,
    relationOther: false,
    event: false,
    reactionOther: false,
    userAction: false,
    chatContent: true,
  }), 'chatContent');

  assert.equal(ERROR_FIELD_ELEMENT_IDS.personName, 'person-name');
  assert.equal(ERROR_FIELD_ELEMENT_IDS.event, 'event-facts');
  assert.equal(ERROR_FIELD_ELEMENT_IDS.chatContent, 'chat-platform-choice');
});
