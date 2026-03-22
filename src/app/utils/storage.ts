import { ConsultationData, AnalysisResult, ActionSuggestion, AIAnalysisResult } from '../types';

const STORAGE_KEYS = {
  CONSULTATIONS: 'kanjo-navi-consultations',
  ANALYSES: 'kanjo-navi-analyses',
  SUGGESTIONS: 'kanjo-navi-suggestions',
  AI_ANALYSES: 'kanjo-navi-ai-analyses',
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
export const saveAnalysis = (data: AnalysisResult): void => {
  const analyses = getAnalyses();
  analyses.push(data);
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

// 行動提案の保存
export const saveSuggestion = (data: ActionSuggestion): void => {
  const suggestions = getSuggestions();
  suggestions.push(data);
  localStorage.setItem(STORAGE_KEYS.SUGGESTIONS, JSON.stringify(suggestions));
};

// 全行動提案の取得
export const getSuggestions = (): ActionSuggestion[] => {
  const data = localStorage.getItem(STORAGE_KEYS.SUGGESTIONS);
  return data ? JSON.parse(data) : [];
};

// 特定の行動提案取得
export const getSuggestion = (consultationId: string): ActionSuggestion | undefined => {
  const suggestions = getSuggestions();
  return suggestions.find(s => s.consultationId === consultationId);
};

// AI 分析結果の保存
export const saveAIAnalysis = (data: AIAnalysisResult): void => {
  const list = getAIAnalyses();
  list.push(data);
  localStorage.setItem(STORAGE_KEYS.AI_ANALYSES, JSON.stringify(list));
};

// 全 AI 分析結果の取得
export const getAIAnalyses = (): AIAnalysisResult[] => {
  const data = localStorage.getItem(STORAGE_KEYS.AI_ANALYSES);
  return data ? JSON.parse(data) : [];
};

// 特定の AI 分析結果取得
export const getAIAnalysis = (consultationId: string): AIAnalysisResult | undefined => {
  const list = getAIAnalyses();
  return list.find(a => a.consultationId === consultationId);
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