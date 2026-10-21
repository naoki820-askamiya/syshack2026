import assert from 'node:assert/strict';
import test from 'node:test';
import { feedbackInput, saveLoadedFeedback, type FeedbackInput, type FeedbackRequests } from '../../app/utils/feedbackModel.js';

const initial = { helpfulnessScore: 4, overreadScore: 2, outcomeNote: '合成の振り返り', allowPersonalizationUse: true };
const saved = { id: 'feedback-id', ...initial };
const requests = (calls: string[]): FeedbackRequests => ({
  create: async (id, input) => { calls.push(`POST:${id}`); return { feedback: { id: 'new-id', ...input } }; },
  update: async (id, input) => { calls.push(`PATCH:${id}`); return { feedback: { id, ...input } }; },
});

test('feedback GET missing value creates once; existing feedback edits by id and persists revoked permission', async () => {
  const calls: string[] = [];
  await saveLoadedFeedback('result-id', null, initial, requests(calls));
  const edited: FeedbackInput = { ...feedbackInput(saved), outcomeNote: '修正した合成の振り返り', allowPersonalizationUse: false };
  const response = await saveLoadedFeedback('result-id', saved, edited, requests(calls));
  assert.deepEqual(calls, ['POST:result-id', 'PATCH:feedback-id']);
  assert.deepEqual(feedbackInput(response.feedback), edited);
  assert.equal(response.feedback.allowPersonalizationUse, false);
});

test('feedback failed or incomplete GET cannot create a duplicate', async () => {
  const calls: string[] = [];
  await assert.rejects(saveLoadedFeedback('result-id', undefined, initial, requests(calls)), /取得/);
  assert.deepEqual(calls, []);
});

test('reload mapping restores scores, text and explicit permission from saved feedback', () => {
  assert.deepEqual(feedbackInput(saved), initial);
  assert.deepEqual(feedbackInput({ ...saved, helpfulnessScore: null, outcomeNote: null, allowPersonalizationUse: false }), {
    ...initial, helpfulnessScore: null, outcomeNote: null, allowPersonalizationUse: false,
  });
});
