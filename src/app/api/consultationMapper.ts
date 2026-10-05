import type { ConsultationData, Reaction, RelationType, Timing } from '../types.js';

const RELATIONSHIP_TYPES_FROM_API: Record<string, RelationType> = {
  boss: '上司',
  coworker: '同僚',
  subordinate: '部下',
  lover: '恋人',
  spouse: '配偶者',
  friend: '友人',
  family: '家族',
  customer: 'その他',
  classmate: 'その他',
  other: 'その他',
};

const REACTIONS = new Set<Reaction>([
  '怒っていそう', '冷たい', '悲しそう', '不満そう', 'つまらなそう',
  '嫌そう', '嬉しそう', '楽しそう', '分からない', 'その他',
]);

const TIMINGS = new Set<Timing>(['直後', '数時間後', '翌日', '数日後']);

export interface ApiPerson {
  id: string;
  displayName: string;
  relationshipType: string;
}

export interface ApiAnalysisCase {
  personSnapshot?: unknown;
  id: string;
  personId: string;
  eventFacts: string;
  perceivedPartnerReaction: string;
  elapsedTimeType: string;
  userResponseText: string | null;
  userAgeRange: string;
  userGender: string;
  createdAt: string;
}

export function personFromCaseSnapshot(value: unknown): Pick<ApiPerson, 'displayName' | 'relationshipType'> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const snapshot = value as Record<string, unknown>;
  if (snapshot.schemaVersion !== 'person-snapshot-v1' || !snapshot.person || typeof snapshot.person !== 'object' || Array.isArray(snapshot.person)) return null;
  const person = snapshot.person as Record<string, unknown>;
  return typeof person.displayName === 'string' && typeof person.relationshipType === 'string' &&
    Object.hasOwn(RELATIONSHIP_TYPES_FROM_API, person.relationshipType)
    ? { displayName: person.displayName, relationshipType: person.relationshipType } : null;
}

export function relationshipLabel(value: string): RelationType {
  return RELATIONSHIP_TYPES_FROM_API[value] ?? 'その他';
}

export function toConsultation(
  analysisCase: ApiAnalysisCase,
  person: ApiPerson,
): ConsultationData {
  return {
    id: analysisCase.id,
    personId: analysisCase.personId,
    personName: person.displayName,
    relation: relationshipLabel(person.relationshipType),
    event: analysisCase.eventFacts,
    reaction: REACTIONS.has(analysisCase.perceivedPartnerReaction as Reaction)
      ? analysisCase.perceivedPartnerReaction as Reaction
      : 'その他',
    userAction: analysisCase.userResponseText ?? '',
    timing: TIMINGS.has(analysisCase.elapsedTimeType as Timing)
      ? analysisCase.elapsedTimeType as Timing
      : '直後',
    createdAt: analysisCase.createdAt,
    ageGroup: analysisCase.userAgeRange,
    gender: analysisCase.userGender,
  };
}
