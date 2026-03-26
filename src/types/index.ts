// AI 分析結果の確信度です。
// UI や保存側で扱いやすいよう、文字列を固定の候補に絞っています。
export type AnalysisConfidenceLevel = "low" | "medium" | "high";

// 返信例のトーンを表します。
// 文章例を出すときに、丁寧さの違いを明示するために使います。
export type AnalysisReplyTone = "formal" | "neutral" | "casual";

// actions などの「テキストだけ持つ配列項目」の共通型です。
export interface AnalysisTextItem {
    text: string;
}

// 返信例は本文に加えてトーンも必要なので、専用の型にしています。
export interface AnalysisReplyExample {
    text: string;
    tone: AnalysisReplyTone;
}

// AI が「なぜそう判断したか」を返すための型です。
export interface AnalysisReason {
    label: string;
    detail: string;
}

// 画面や保存処理で利用する感情スコアのまとまりです。
export interface AnalysisScores {
    angry: number;
    busy: number;
    justCold: number;
    positive: number;
    distance: number;
}

// B 側が結果保存に使う、AI 分析結果の本体です。
// analyze() は最終的にこの shape を返すことを前提にしています。
export interface AIAnalysisResult {
    textImpression: string;
    contextImpression: string;
    scores: AnalysisScores;
    confidenceLevel: AnalysisConfidenceLevel;
    contactTiming: string;
    actions: AnalysisTextItem[];
    avoidExpressions: AnalysisTextItem[];
    goodSignals: AnalysisTextItem[];
    replyExamples: AnalysisReplyExample[];
    reasons: AnalysisReason[];
}

// B 側の既存実装に合わせた analyze() の返却型です。
export interface AnalyzeResponse {
    status: "analyzed";
    result: AIAnalysisResult;
}

// B 側 service から受け取る analysisCase の入力型です。
// 実体は service 側のデータに依存するため、最低限使う項目だけを定義しています。
export interface AnalysisCaseInput {
    id?: string;
    personId?: string;
    sessionId?: string;
    status?: string;
    eventFacts: string;
    selfMessage?: string;
    partnerMessage?: string;
    [key: string]: unknown;
}

// AI に渡す前に必要な情報だけへ絞り込んだ DTO です。
// B 側の entity 全体を AI 層に持ち込まないための境界として使います。
export interface AIInputDTO {
    caseId: string;
    eventFacts: string;
    selfMessage: string;
    partnerMessage: string;
}

// 共通エラーの shape です。
// middleware や AI 層で投げたエラーを、同じ形式で扱えるようにしています。
export interface AppErrorShape {
    code: string;
    message: string;
    status: number;
    cause?: unknown;
}

// API の最終返却形式を表す型です。
// エラー形式を統一しておくと、フロントや他の層で扱いやすくなります。
export interface ErrorResponseBody {
    error: {
        code: string;
        message: string;
        status: number;
    };
}

// middleware で使う最小限の request 互換型です。
// 本物の Express 型に強く依存しすぎないよう、必要な項目だけ定義しています。
export interface RequestLike {
    headers?: Record<string, string | string[] | undefined>;
    sessionId?: string;
}

// middleware で使う最小限の response 互換型です。
export interface ResponseLike {
    status?: (statusCode: number) => ResponseLike;
    json?: (body: unknown) => unknown;
    statusCode?: number;
    body?: unknown;
}

// next() 相当の関数型です。
export type NextLike = (error?: unknown) => void;

export type RelationshipType =
    | "boss"
    | "coworker"
    | "lover"
    | "family"
    | "friend"
    | "classmate"
    | "customer"
    | "other";

export type GenderHint = "male" | "female" | "other" | "unknown";

export interface AnalyzePersonInput {
    displayName: string;
    relationshipType: RelationshipType;
    ageRange: string;
    genderHint: GenderHint;
    notes: string;
}

export interface AnalyzeCaseFormInput {
    eventFacts: string;
    selfMessage: string;
    partnerMessage: string;
    recentConversationText: string;
    appType: string;
    userEmotion: string;
    assumedPartnerEmotion: string;
    partnerSpeakingStyle: string;
    contextNote: string;
    concernText: string;
    emojiUsed: string;
    toneType: string;
    messageLengthType: string;
}

export interface CreateAnalysisCaseBody {
    personId: string;
    eventFacts: string;
    selfMessage: string;
    partnerMessage: string;
    recentConversationText: string;
    appType: string;
    userEmotion: string;
    assumedPartnerEmotion: string;
    partnerSpeakingStyle: string;
    contextNote: string;
    concernText: string;
    emojiUsed: string;
    toneType: string;
    messageLengthType: string;
}

export interface CreatePersonBody {
    displayName: string;
    relationshipType: RelationshipType;
    ageRange?: string;
    genderHint?: GenderHint;
    notes?: string;
}

export type AnalysisCaseStatus = "draft" | "analyzing" | "analyzed" | "error";

export interface StoredPerson extends AnalyzePersonInput {
    id: string;
    sessionId: string;
    createdAt: string;
    updatedAt: string;
}

export interface StoredAnalysisCase {
    id: string;
    personId: string;
    sessionId: string;
    status: AnalysisCaseStatus;
    person: AnalyzePersonInput;
    analysisCase: AnalyzeCaseFormInput;
    createdAt: string;
    updatedAt: string;
}

export interface StoredAnalysisResult {
    id: string;
    analysisCaseId: string;
    result: AIAnalysisResult;
    createdAt: string;
    updatedAt: string;
}

export interface PaginationOptions {
    limit: number;
    offset: number;
}
