import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearCachedConsultations,
  getConsultations,
  replaceConsultations,
  saveConsultation,
} from '../../app/utils/storage.js';
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
