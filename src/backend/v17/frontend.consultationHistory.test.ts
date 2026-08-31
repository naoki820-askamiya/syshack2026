import assert from 'node:assert/strict';
import test from 'node:test';
import type { ConsultationData } from '../../app/types.js';
import {
  findLatestConsultationByPersonName,
  getLatestConsultationsByPerson,
} from '../../app/utils/consultationHistory.js';

const consultations: ConsultationData[] = [
  {
    id: 'case-a-old', personId: 'person-a', personName: 'Aさん', relation: '同僚',
    event: 'old', reaction: '冷たい', userAction: '', timing: '直後',
    createdAt: '2026-08-01T00:00:00.000Z',
  },
  {
    id: 'case-b', personId: 'person-b', personName: 'Bさん', relation: '友人',
    event: 'middle', reaction: '楽しそう', userAction: '', timing: '翌日',
    createdAt: '2026-08-02T00:00:00.000Z',
  },
  {
    id: 'case-a-new', personId: 'person-a', personName: 'Aさん', relation: '上司',
    event: 'new', reaction: '不満そう', userAction: '', timing: '数時間後',
    createdAt: '2026-08-03T00:00:00.000Z',
  },
];

test('person selection reuses the latest consultation for the same name', () => {
  assert.equal(findLatestConsultationByPersonName(consultations, 'Aさん')?.id, 'case-a-new');
  assert.equal(findLatestConsultationByPersonName(consultations, 'unknown'), undefined);
});

test('recent person list contains one latest consultation per person', () => {
  assert.deepEqual(
    getLatestConsultationsByPerson(consultations).map((consultation) => consultation.id),
    ['case-a-new', 'case-b'],
  );
});
