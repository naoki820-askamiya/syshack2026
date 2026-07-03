// 関係性のタイプ
export type RelationType = '上司' | '同僚' | '部下' | '恋人' | '配偶者' | '友人' | '家族' | 'その他';

// 相手の反応
export type Reaction =
  | '怒っていそう'
  | '冷たい'
  | '悲しそう'
  | '不満そう'
  | 'つまらなそう'
  | '嫌そう'
  | '嬉しそう'
  | '楽しそう'
  | '分からない'
  | 'その他';

// 感情タイプ
export type EmotionType = '怒り' | '悲しみ' | '不満' | '失望' | '不安' | '困惑';

// 機嫌レベル
export type MoodLevel = '良い' | '普通' | '悪い';

// 危険度
export type DangerLevel = '低' | '中' | '高';

// タイミング
export type Timing = '直後' | '数時間後' | '翌日' | '数日後';

// 相談データ
export interface ConsultationData {
  id: string;
  personName: string;
  relation: RelationType;
  event: string;
  reaction: Reaction;
  userAction: string;
  timing: Timing;
  createdAt: string;
  ageGroup?: string;
  gender?: string;
}

// ── 分析結果（新） ──────────────────────────────────

export interface EmotionScores {
  angry: number;
  cold: number;
  busy: number;
  pressure: number;
  distance: number;
  happy: number;
  joy: number;
  relief: number;
}

export interface ReplyExample {
  text: string;
  tone: 'formal' | 'neutral' | 'casual';
}

export interface AnalysisReason {
  label: string;
  detail: string;
}

export interface AnalysisResult {
  consultationId: string;
  status: "analyzed";
  result: {
    textImpression: string;
    contextImpression: string;
    scores: EmotionScores;
    confidenceLevel: 'low' | 'medium' | 'high';
    contactTiming: string;
    actions: { text: string }[];
    avoidExpressions: { text: string }[];
    goodSignals: { text: string }[];
    replyExamples: ReplyExample[];
    reasons: AnalysisReason[];
  }
}
