export type ConfidenceLevel = 'low' | 'medium' | 'high' | 'unknown';
export type EvidenceSource = 'current_case' | 'person_profile' | 'recent_case' | 'feedback' | 'unknown';
export type EvidenceStrength = ConfidenceLevel | 'unknown';
export interface AnalysisEvidenceView { text: string; source: EvidenceSource; strength: EvidenceStrength }
export interface ComparisonPatternView { label: string; source: EvidenceSource; relevance: EvidenceStrength }
export interface ComparisonReasonView { label: string; reason: string }
export interface ComparisonDeviationView extends ComparisonReasonView { strength: EvidenceStrength }

export type ActionSafety = 'safe' | 'caution' | 'unknown';

export function actionSafetyLabel(safety: ActionSafety): string {
  return safety === 'safe' ? '比較的安全な候補' : safety === 'caution' ? '注意して検討' : '安全性の情報なし・慎重に検討';
}

export interface AnalysisScoreView {
  key: string;
  label: string;
  score: number;
  category: 'concern' | 'context' | 'reassurance' | 'unknown';
  reason?: string;
}

export interface AnalysisView {
  resultId: string | null;
  schemaVersion: string;
  isLegacy: boolean;
  confidenceLevel: ConfidenceLevel;
  summary: string;
  textImpression: string;
  situationReading: string;
  scoreDescription?: string;
  scores: AnalysisScoreView[];
  concernSignals: AnalysisEvidenceView[];
  reassuringSignals: AnalysisEvidenceView[];
  unknowns: string[];
  alternatives: { label: string; reason: string }[];
  possibleBiases: { label: string; basis: string }[];
  balancedView: string;
  recommendedActions: { label: string; reason: string; safety: ActionSafety }[];
  avoidActions: { label: string; reason: string }[];
  replyDrafts: { tone: 'formal' | 'normal' | 'light'; text: string }[];
  contactTiming: string;
  contextComparison: { enabled: boolean; conclusion: string; patterns: ComparisonPatternView[]; sameAsUsual: ComparisonReasonView[]; deviations: ComparisonDeviationView[] };
  disclaimer: string;
}

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const confidence = (value: unknown): ConfidenceLevel =>
  value === 'low' || value === 'medium' || value === 'high' ? value : 'unknown';

const score100 = (value: unknown): number => {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(100, Math.round(numeric)));
};

const legacyScore100 = (value: unknown): number => {
  // 旧結果だけは0〜1の確率形式があるため、現行v2の整数スコアと分けて互換変換します。
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return score100(numeric >= 0 && numeric <= 1 ? numeric * 100 : numeric);
};

const objectArray = (value: unknown): JsonObject[] =>
  Array.isArray(value) ? value.filter(isObject) : [];

const stringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const evidenceSource = (value: unknown): EvidenceSource =>
  value === 'current_case' || value === 'person_profile' || value === 'recent_case' || value === 'feedback' ? value : 'unknown';
const evidenceStrength = (value: unknown): EvidenceStrength =>
  value === 'low' || value === 'medium' || value === 'high' ? value : 'unknown';
const evidenceItems = (value: unknown): AnalysisEvidenceView[] => objectArray(value).map(item => ({
  text: text(item.text), source: evidenceSource(item.source), strength: evidenceStrength(item.strength),
})).filter(item => item.text.length > 0);
const legacyEvidence = (value: string): AnalysisEvidenceView => ({ text: value, source: 'unknown', strength: 'unknown' });

function normalizeV2(root: JsonObject): AnalysisView | null {
  const result = isObject(root.result) ? root.result : root;
  const analysis = isObject(result.analysis) ? result.analysis : null;
  if (!analysis || !isObject(analysis.emotionScoreAnalysis)) return null;

  const scoreContainer = analysis.emotionScoreAnalysis;
  const rawScores = isObject(scoreContainer.scores) ? scoreContainer.scores : {};
  const scoreOrder = ['anger', 'coldness', 'distance', 'busyness', 'flatness', 'reassurance'];
  const scores = scoreOrder.flatMap((key): AnalysisScoreView[] => {
    const item = rawScores[key];
    if (!isObject(item)) return [];
    return [{
      key,
      label: text(item.label, key),
      score: score100(item.score),
      category: item.category === 'relief' ? 'reassurance' : item.category === 'context' ? 'context' : item.category === 'concern' ? 'concern' : 'unknown',
      reason: text(item.reason),
    }];
  });
  // 一部欠損をもっともらしく表示せず、固定6指標の契約を満たす結果だけを採用します。
  if (scores.length !== 6) return null;

  const evidence = isObject(analysis.evidence) ? analysis.evidence : {};
  const reframe = isObject(analysis.cognitiveReframe) ? analysis.cognitiveReframe : {};
  const disclaimer = isObject(analysis.disclaimer) ? analysis.disclaimer : {};
  const usual = isObject(analysis.usualVsCurrent) ? analysis.usualVsCurrent : {};

  return {
    resultId: text(result.id) || null,
    schemaVersion: text(result.resultSchemaVersion, 'kigen-analysis-result-v2'),
    isLegacy: false,
    confidenceLevel: confidence(analysis.confidenceLevel),
    summary: isObject(analysis.summary) ? text(analysis.summary.oneLine) : '',
    textImpression: isObject(analysis.textImpression) ? text(analysis.textImpression.body) : '',
    situationReading: isObject(analysis.situationReading) ? text(analysis.situationReading.body) : '',
    scoreDescription: text(scoreContainer.description),
    scores,
    concernSignals: evidenceItems(evidence.signalsForConcern),
    reassuringSignals: evidenceItems(evidence.signalsAgainstConcern),
    unknowns: stringArray(evidence.unknowns),
    alternatives: objectArray(analysis.alternativeInterpretations).map((item) => ({
      label: text(item.label), reason: text(item.reason),
    })),
    possibleBiases: objectArray(reframe.possibleBiases).map((item) => ({
      label: text(item.label), basis: text(item.basis),
    })),
    balancedView: text(reframe.balancedView),
    recommendedActions: objectArray(analysis.recommendedActions).map((item) => ({
      label: text(item.label), reason: text(item.reason),
      safety: item.safety === 'safe' || item.safety === 'caution' ? item.safety : 'unknown',
    })),
    avoidActions: objectArray(analysis.avoidActions).map((item) => ({
      label: text(item.label), reason: text(item.reason),
    })),
    replyDrafts: objectArray(analysis.replyDrafts).map((item) => ({
      tone: item.tone === 'formal' || item.tone === 'light' ? item.tone : 'normal',
      text: text(item.text),
    })),
    contactTiming: text(analysis.contactTiming),
    contextComparison: {
      enabled: usual.enabled === true,
      conclusion: text(usual.comparisonConclusion),
      patterns: usual.enabled === true ? objectArray(usual.usualPatternsUsed).map(item => ({
        label: text(item.label), source: evidenceSource(item.source), relevance: evidenceStrength(item.relevance),
      })).filter(item => item.label.length > 0) : [],
      sameAsUsual: usual.enabled === true ? objectArray(usual.sameAsUsual).map(item => ({
        label: text(item.label), reason: text(item.reason),
      })).filter(item => item.label.length > 0) : [],
      deviations: usual.enabled === true ? objectArray(usual.deviationSignals).map(item => ({
        label: text(item.label), reason: text(item.reason), strength: evidenceStrength(item.strength),
      })).filter(item => item.label.length > 0) : [],
    },
    disclaimer: text(disclaimer.text, 'AIの出力は診断や事実の断定ではなく、状況を整理するための参考情報です。'),
  };
}

function normalizeLegacy(root: JsonObject): AnalysisView | null {
  const legacy = isObject(root.result) ? root.result : null;
  if (!legacy || !isObject(legacy.scores)) return null;
  const rawScores = legacy.scores;
  const meta = [
    ['angry', '怒り', 'concern'], ['cold', '冷たさ', 'concern'],
    ['busy', '忙しさ', 'concern'], ['pressure', '圧の強さ', 'concern'],
    ['distance', '距離感', 'concern'], ['happy', '機嫌のよさ', 'reassurance'],
    ['joy', '嬉しさ', 'reassurance'], ['relief', '安心', 'reassurance'],
  ] as const;

  return {
    resultId: null,
    schemaVersion: 'legacy-v1',
    isLegacy: true,
    confidenceLevel: confidence(legacy.confidenceLevel),
    summary: text(legacy.contextImpression, '旧形式の分析結果です。'),
    textImpression: text(legacy.textImpression),
    situationReading: text(legacy.contextImpression),
    scores: meta.map(([key, label, category]) => ({ key, label, category, score: legacyScore100(rawScores[key]) })),
    concernSignals: objectArray(legacy.reasons).map((item) => legacyEvidence(`${text(item.label)}：${text(item.detail)}`)),
    reassuringSignals: objectArray(legacy.goodSignals).map((item) => text(item.text)).filter(Boolean).map(legacyEvidence),
    unknowns: [], alternatives: [], possibleBiases: [],
    balancedView: text(legacy.contextImpression),
    recommendedActions: objectArray(legacy.actions).map((item) => ({ label: text(item.text), reason: '', safety: 'unknown' })),
    avoidActions: objectArray(legacy.avoidExpressions).map((item) => ({ label: text(item.text), reason: '' })),
    replyDrafts: objectArray(legacy.replyExamples).map((item) => ({
      tone: item.tone === 'formal' ? 'formal' : item.tone === 'casual' ? 'light' : 'normal',
      text: text(item.text),
    })),
    contactTiming: text(legacy.contactTiming),
    contextComparison: { enabled: false, conclusion: "旧形式では利用文脈の要約は記録されていません。", patterns: [], sameAsUsual: [], deviations: [] },
    disclaimer: '旧形式のAI分析です。感情の断定や診断ではなく、状況整理の参考として確認してください。',
  };
}

export function normalizeAnalysis(raw: unknown): AnalysisView | null {
  if (!isObject(raw)) return null;
  return normalizeV2(raw) ?? normalizeLegacy(raw);
}
