import { ConsultationData, AnalysisResult } from '../types';

const STORAGE_KEYS = {
  CONSULTATIONS: 'kanjo-navi-consultations',
  ANALYSES: 'kanjo-navi-analyses',
};

// 相談データの保存
export const saveConsultation = (data: ConsultationData): void => {
  const consultations = getConsultations();
  consultations.push(data);
  localStorage.setItem(STORAGE_KEYS.CONSULTATIONS, JSON.stringify(consultations));
};

// 全相談データの取得
export const getConsultations = (): ConsultationData[] => {
  const data = localStorage.getItem(STORAGE_KEYS.CONSULTATIONS);
  return data ? JSON.parse(data) : [];
};

// 特定の相談データ取得
export const getConsultation = (id: string): ConsultationData | undefined => {
  const consultations = getConsultations();
  return consultations.find(c => c.id === id);
};

// 分析結果の保存
export const saveAnalysis = (consultationId: string, data: AnalysisResult): void => {
  const analyses = getAnalyses();
  const newAnalysis = { ...data, consultationId };
  const existingIndex = analyses.findIndex(a => a.consultationId === consultationId);
  if (existingIndex > -1) {
    analyses[existingIndex] = newAnalysis;
  } else {
    analyses.push(newAnalysis);
  }
  localStorage.setItem(STORAGE_KEYS.ANALYSES, JSON.stringify(analyses));
};

// 全分析結果の取得
export const getAnalyses = (): AnalysisResult[] => {
  const data = localStorage.getItem(STORAGE_KEYS.ANALYSES);
  return data ? JSON.parse(data) : [];
};

// 特定の分析結果取得
export const getAnalysis = (consultationId: string): AnalysisResult | undefined => {
  const analyses = getAnalyses();
  return analyses.find(a => a.consultationId === consultationId);
};

// 人物ごとの相談履歴を取得
export const getConsultationsByPerson = (personName: string): ConsultationData[] => {
  const consultations = getConsultations();
  return consultations.filter(c => c.personName === personName);
};

// 登録済みの人物一覧を取得
export const getRegisteredPersons = (): string[] => {
  const consultations = getConsultations();
  const personNames = consultations.map(c => c.personName);
  return Array.from(new Set(personNames));
};