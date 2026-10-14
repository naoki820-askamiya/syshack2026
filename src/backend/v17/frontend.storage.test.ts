import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearCachedConsultations,
  getConsultations,
  replaceConsultations,
  saveConsultation,
} from '../../app/utils/storage.js';
import { captureAuthBoundary, finishExplicitLogin, setAuthenticatedUser, subscribeAuthBoundary } from '../../app/utils/authBoundary.js';
import { getAnalysis, saveAnalysis } from '../../app/utils/storage.js';
import type { ConsultationData } from '../../app/types.js';

const consultation = (id: string, event: string): ConsultationData => ({
  id,
  personId: '11111111-1111-4111-8111-111111111111',
  personName: 'テスト上司',
  relation: '上司',
  event,
  reaction: '分からない',
  userAction: '',
  timing: '直後',
  createdAt: '2026-08-28T00:00:00.000Z',
});

test('consultation cache can be replaced from DB history and upserts by case id', () => {
  setAuthenticatedUser('user-A');
  clearCachedConsultations();
  replaceConsultations([consultation('case-1', '最初の履歴')]);
  saveConsultation(consultation('case-1', '更新された履歴'));
  saveConsultation(consultation('case-2', '追加の履歴'));

  assert.deepEqual(
    getConsultations().map(({ id, event }) => ({ id, event })),
    [
      { id: 'case-1', event: '更新された履歴' },
      { id: 'case-2', event: '追加の履歴' },
    ],
  );
  clearCachedConsultations();
});


test('auth identity change clears consultation and analysis cache before subscribers read it', () => {
  setAuthenticatedUser('user-A', { newSession: true });
  saveConsultation(consultation('case-A', 'private A'));
  saveAnalysis('case-A', { summary: 'private A' });
  setAuthenticatedUser('user-B');
  assert.deepEqual(getConsultations(), []);
  assert.equal(getAnalysis('case-A'), undefined);
});

test('expired sessions and same-user re-login reject delayed responses from the old session', () => {
  setAuthenticatedUser('user-A', { newSession: true });
  const old = captureAuthBoundary();
  setAuthenticatedUser(null);
  assert.deepEqual(getConsultations(), []);
  setAuthenticatedUser('user-A', { newSession: true });
  assert.throws(() => saveConsultation(consultation('case-A', 'delayed A'), old), /ログイン状態/);
  assert.throws(() => saveAnalysis('case-A', { summary: 'delayed A' }, old), /ログイン状態/);
  assert.throws(() => replaceConsultations([consultation('case-A', 'delayed A')], old), /ログイン状態/);
  assert.deepEqual(getConsultations(), []);
  assert.equal(getAnalysis('case-A'), undefined);
});

test('delayed A responses cannot write cache after B signs in', () => {
  setAuthenticatedUser('user-A', { newSession: true });
  const old = captureAuthBoundary();
  setAuthenticatedUser('user-B');
  assert.throws(() => saveConsultation(consultation('case-A', 'delayed A'), old), /ログイン状態/);
  assert.deepEqual(getConsultations(), []);
});


test('cache clears synchronously before later auth observers see the next session', () => {
  setAuthenticatedUser('user-A', { newSession: true });
  saveConsultation(consultation('case-A', 'private A'));
  const unsubscribe = subscribeAuthBoundary(() => assert.deepEqual(getConsultations(), []));
  setAuthenticatedUser('user-B');
  unsubscribe();
});

test('token refresh preserves cache, while a new session for the same user clears it', () => {
  setAuthenticatedUser('user-A', { newSession: true });
  const before = captureAuthBoundary();
  saveConsultation(consultation('case-A', 'private A'));
  assert.equal(setAuthenticatedUser('user-A').epoch, before.epoch);
  assert.equal(getConsultations().length, 1);
  assert.ok(setAuthenticatedUser('user-A', { newSession: true }).epoch > before.epoch);
  assert.deepEqual(getConsultations(), []);
});


test('auth reconfirmation retains state; only the current explicit same-user login finishes a new epoch', () => {
  setAuthenticatedUser('user-A', { newSession: true });
  const start = captureAuthBoundary();
  saveConsultation(consultation('case-A', 'private A'));
  setAuthenticatedUser('user-A'); // repeated SIGNED_IN/refocus or TOKEN_REFRESHED
  assert.equal(captureAuthBoundary().epoch, start.epoch);
  finishExplicitLogin(start, 'user-A', true); // older concurrent sign-in attempt
  assert.equal(captureAuthBoundary().epoch, start.epoch);
  assert.equal(getConsultations().length, 1);
  finishExplicitLogin(start, 'user-A');
  assert.ok(captureAuthBoundary().epoch > start.epoch);
  assert.deepEqual(getConsultations(), []);
  saveConsultation(consultation('case-new', 'new private A'));
  finishExplicitLogin(start, 'user-A'); // delayed old sign-in result cannot clear newer state
  assert.equal(getConsultations()[0]?.id, 'case-new');
});

test('delayed sign-in result never rotates a newer identity or session epoch', () => {
  setAuthenticatedUser('user-A', { newSession: true });
  const start = captureAuthBoundary();
  setAuthenticatedUser('user-B');
  saveConsultation(consultation('case-B', 'private B'));
  const before = captureAuthBoundary();
  finishExplicitLogin(start, 'user-A');
  assert.equal(captureAuthBoundary().epoch, before.epoch);
  assert.equal(getConsultations()[0]?.id, 'case-B');
});
