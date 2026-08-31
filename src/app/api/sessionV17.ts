import { saveAnalysis, saveConsultation, replaceConsultations } from '../utils/storage';
import type { ConsultationData } from '../types';
import { fetchApiJson } from './client';
import {
  toConsultation,
  type ApiAnalysisCase,
  type ApiPerson,
} from './consultationMapper';

const RELATIONSHIP_TYPES: Record<string, string> = {
  上司: 'boss', 同僚: 'coworker', 部下: 'subordinate', 恋人: 'lover',
  配偶者: 'spouse', 友人: 'friend', 家族: 'family', その他: 'other',
};

async function listAllPersons(): Promise<ApiPerson[]> {
  const persons: ApiPerson[] = [];
  let offset = 0;
  while (true) {
    const payload = await fetchApiJson<{
      persons: ApiPerson[];
      pagination: { hasMore: boolean };
    }>(`/api/persons?limit=50&offset=${offset}`);
    persons.push(...payload.persons);
    if (!payload.pagination.hasMore) return persons;
    offset += payload.persons.length;
  }
}

async function listAllCases(personId: string): Promise<ApiAnalysisCase[]> {
  const cases: ApiAnalysisCase[] = [];
  let offset = 0;
  while (true) {
    const payload = await fetchApiJson<{
      analysisCases: ApiAnalysisCase[];
      pagination: { hasMore: boolean };
    }>(
      `/api/persons/${personId}/analysis-cases?limit=50&offset=${offset}`,
    );
    cases.push(...payload.analysisCases);
    if (!payload.pagination.hasMore) return cases;
    offset += payload.analysisCases.length;
  }
}

export async function loadConsultationHistory(): Promise<ConsultationData[]> {
  const persons = await listAllPersons();
  const casesByPerson = await Promise.all(
    persons.map(async (person) => ({ person, cases: await listAllCases(person.id) })),
  );
  const consultations = casesByPerson
    .flatMap(({ person, cases }) => cases.map((analysisCase) => toConsultation(analysisCase, person)))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  replaceConsultations(consultations);
  return consultations;
}

export async function hydrateAnalysis(caseId: string): Promise<boolean> {
  const { analysisCase } = await fetchApiJson<{ analysisCase: ApiAnalysisCase }>(
    `/api/analysis-cases/${caseId}`,
  );
  const { person } = await fetchApiJson<{ person: ApiPerson }>(
    `/api/persons/${analysisCase.personId}`,
  );
  saveConsultation(toConsultation(analysisCase, person));

  const { result } = await fetchApiJson<{ result: Record<string, unknown> | null }>(
    `/api/analysis-cases/${caseId}/results/latest`,
  );
  if (!result) return false;
  saveAnalysis(caseId, { status: 'analyzed', result });
  return true;
}

export async function createPerson(params: { displayName: string; relationshipType: string }) {
  return fetchApiJson<{ person: { id: string } }>('/api/persons', {
    method: 'POST',
    body: JSON.stringify({
      displayName: params.displayName,
      relationshipType: RELATIONSHIP_TYPES[params.relationshipType] ?? 'other',
    }),
  });
}

export interface CreateAnalysisCaseRequest {
  personId: string;
  userAgeRange: string;
  userGender: string;
  perceivedPartnerReaction: string;
  elapsedTimeType: string;
  eventFacts: string;
  userResponseType: 'action' | 'conversation' | 'none';
  userResponseText: string | null;
}

export async function createAnalysisCase(params: CreateAnalysisCaseRequest) {
  return fetchApiJson<{ analysisCase: { id: string } }>('/api/analysis-cases', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function analyze(caseId: string): Promise<unknown> {
  const result: unknown = await fetchApiJson(`/api/analysis-cases/${caseId}/analyze`, {
    method: 'POST',
  });
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("分析APIから不正な形式の応答が返されました。");
  }
  // 画面遷移中だけ保持し、localStorage等へ永続化しません。
  saveAnalysis(caseId, result as Record<string, unknown>);
  return result;
}
