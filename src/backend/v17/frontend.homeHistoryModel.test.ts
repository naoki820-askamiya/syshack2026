import assert from 'node:assert/strict';
import test from 'node:test';
import { recentConsultations, visibleHomeHistory } from '../../app/utils/homeHistoryModel.js';
import type { ConsultationData } from '../../app/types.js';

const consultation = (day: number): ConsultationData => ({
  id: `case-${day}`, personId: `person-${day}`, personName: '合成名', relation: '友人',
  event: '合成の出来事', reaction: '分からない', userAction: '', timing: '翌日',
  createdAt: `2026-10-0${day}T00:00:00Z`,
});

test('Home selects latest five from seven regardless of DB-cache insertion ordering', () => {
  for (const days of [[7, 6, 5, 4, 3, 2, 1], [1, 5, 2, 7, 4, 6, 3]]) {
    const input = days.map(consultation);
    const before = input.map((value) => value.id);
    assert.deepEqual(recentConsultations(input).map((value) => value.id), ['case-7', 'case-6', 'case-5', 'case-4', 'case-3']);
    assert.deepEqual(input.map((value) => value.id), before);
  }
});

test('user switch and expiry/re-login hide prior Home loaded data or errors before effects run', () => {
  const state = { boundary: { userId: 'A', epoch: 1 }, status: 'loaded' as const, consultations: [consultation(7)], error: '' };
  for (const boundary of [{ userId: 'B', epoch: 2 }, { userId: 'A', epoch: 3 }]) {
    assert.deepEqual(visibleHomeHistory(state, boundary), { boundary, status: 'loading', consultations: [], error: '' });
  }
  assert.equal(visibleHomeHistory(state, state.boundary).status, 'loaded');
  assert.equal(visibleHomeHistory({ ...state, status: 'error', error: 'old user error' }, { userId: 'B', epoch: 2 }).error, '');
});
