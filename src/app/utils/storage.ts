import { ConsultationData, AnalysisResult } from '../types';

const consultations: ConsultationData[] = [];
const analyses: AnalysisResult[] = [];

// 画面遷移中の表示用キャッシュです。相談本文やAI結果はブラウザへ永続保存しません。
export const saveConsultation = (data: ConsultationData): void => {
  consultations.push(data);
};

// 全相談データの取得
export const getConsultations = (): ConsultationData[] => {
  return [...consultations];
};

// 特定の相談データ取得
export const getConsultation = (id: string): ConsultationData | undefined => {
  const consultations = getConsultations();
  return consultations.find(c => c.id === id);
};

// 分析結果の保存
export const saveAnalysis = (consultationId: string, data: AnalysisResult | Record<string, unknown>): void => {
  const newAnalysis = { ...data, consultationId } as AnalysisResult;
  const existingIndex = analyses.findIndex(a => a.consultationId === consultationId);
  if (existingIndex > -1) {
    analyses[existingIndex] = newAnalysis;
  } else {
    analyses.push(newAnalysis);
  }
};

// 全分析結果の取得
export const getAnalyses = (): AnalysisResult[] => {
  return [...analyses];
};

export const clearCachedConsultations = (): void => {
  consultations.length = 0;
  analyses.length = 0;
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
