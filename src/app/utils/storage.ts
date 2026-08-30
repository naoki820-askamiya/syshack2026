import type { ConsultationData } from '../types.js';

type CachedAnalysis = Record<string, unknown> & { consultationId: string };

const consultations: ConsultationData[] = [];
const analyses: CachedAnalysis[] = [];

// 業務データの正本はDBです。この配列は画面遷移用に限り、Web Storageへ永続化しません。
export const saveConsultation = (data: ConsultationData): void => {
  const existingIndex = consultations.findIndex(c => c.id === data.id);
  if (existingIndex > -1) {
    consultations[existingIndex] = data;
  } else {
    consultations.push(data);
  }
};

export const replaceConsultations = (data: ConsultationData[]): void => {
  consultations.length = 0;
  consultations.push(...data);
};

export const getConsultations = (): ConsultationData[] => {
  return [...consultations];
};

export const getConsultation = (id: string): ConsultationData | undefined => {
  const consultations = getConsultations();
  return consultations.find(c => c.id === id);
};

export const saveAnalysis = (consultationId: string, data: Record<string, unknown>): void => {
  const newAnalysis: CachedAnalysis = { ...data, consultationId };
  const existingIndex = analyses.findIndex(a => a.consultationId === consultationId);
  if (existingIndex > -1) {
    analyses[existingIndex] = newAnalysis;
  } else {
    analyses.push(newAnalysis);
  }
};

export const getAnalyses = (): CachedAnalysis[] => {
  return [...analyses];
};

export const clearCachedConsultations = (): void => {
  consultations.length = 0;
  analyses.length = 0;
};

export const getAnalysis = (consultationId: string): CachedAnalysis | undefined => {
  const analyses = getAnalyses();
  return analyses.find(a => a.consultationId === consultationId);
};

export const getRegisteredPersons = (data = getConsultations()): string[] => {
  const personNames = data.map(c => c.personName);
  return Array.from(new Set(personNames));
};
