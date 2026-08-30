import {
    kigenAnalysisResultV2Schema,
    type KigenAnalysisResultV2,
} from "./output.schema.js";
import type { ReferenceContext } from "./input.schema.js";

const MINOR_REPLACEMENTS: ReadonlyArray<[RegExp, string]> = [
    [/相手は怒っています/g, "怒りや不満が含まれている可能性があります"],
    [/相手はあなたを嫌っています/g, "相手が距離を置いている可能性もあります"],
];

const UNSAFE_PATTERNS = [
    /絶対に.{0,12}(怒|嫌)/u,
    /間違いなく.{0,12}(嫌|怒)/u,
    /あなたは認知が歪んで/u,
    /診断結果/u,
    /嫌われ度/u,
    /脈なし度/u,
    /危険度/u,
    /(殴る|蹴る|脅す|晒す|仕返し|復讐|追い詰める)/u,
    /(うつ病|人格障害|サイコパス).{0,12}(です|だ|確定)/u,
] as const;

const GENERIC_REASON_PATTERNS = [
    /^入力内容から(そう|そのように)判断しました[。]?$/u,
    /^一般的に.{0,40}(ため|から)です[。]?$/u,
] as const;

export type AiOutputValidationFailure = "invalid" | "unsafe";

export class AiOutputValidationError extends Error {
    constructor(
        readonly failure: AiOutputValidationFailure,
        message: string,
        readonly cause?: unknown,
    ) {
        super(message);
        this.name = "AiOutputValidationError";
    }
}

export function validateAiOutput(
    candidate: unknown,
    referenceContext?: ReferenceContext,
): KigenAnalysisResultV2 {
    const corrected = applyMinorCorrections(candidate);
    const parsed = kigenAnalysisResultV2Schema.safeParse(corrected);

    if (!parsed.success) {
        throw new AiOutputValidationError("invalid", "AI出力がv2 Schemaに一致しません。", parsed.error);
    }

    const validated = referenceContext
        ? normalizeReferenceComparison(parsed.data, referenceContext)
        : parsed.data;

    const serialized = JSON.stringify(validated);
    if (UNSAFE_PATTERNS.some((pattern) => pattern.test(serialized))) {
        throw new AiOutputValidationError("unsafe", "AI出力に禁止表現が含まれています。");
    }

    validateConcernScore("anger", validated);
    validateConcernScore("coldness", validated);
    validateConcernScore("distance", validated);
    if (referenceContext) validateEvidenceSources(validated, referenceContext);

    if (/^(大丈夫です|問題ありません)[。]?$/u.test(validated.emotionScoreAnalysis.scores.reassurance.reason)) {
        throw new AiOutputValidationError(
            "invalid",
            "reassuranceは断定ではなく、悪く見すぎなくてよい材料として説明する必要があります。",
        );
    }

    return validated;
}

function getAvailableSources(referenceContext: ReferenceContext): Set<string> {
    const availableSources = new Set<string>(["current_case"]);
    if (referenceContext.personProfile !== null) availableSources.add("person_profile");
    if (referenceContext.recentCaseSummaries.length > 0) availableSources.add("recent_case");
    if (referenceContext.recentFeedbacks.length > 0) availableSources.add("feedback");
    return availableSources;
}

function normalizeReferenceComparison(
    result: KigenAnalysisResultV2,
    referenceContext: ReferenceContext,
): KigenAnalysisResultV2 {
    const availableSources = getAvailableSources(referenceContext);
    // AIが入力にない過去情報を根拠に見せないよう、実際に渡したsourceだけへ制限します。
    const normalized = structuredClone(result);
    normalized.usualVsCurrent.usualPatternsUsed =
        normalized.usualVsCurrent.usualPatternsUsed.filter((item) =>
            availableSources.has(item.source),
        );

    normalized.usualVsCurrent.enabled =
        availableSources.size > 1 && normalized.usualVsCurrent.usualPatternsUsed.length > 0;
    if (!normalized.usualVsCurrent.enabled) {
        normalized.usualVsCurrent.usualPatternsUsed = [];
        normalized.usualVsCurrent.sameAsUsual = [];
        normalized.usualVsCurrent.deviationSignals = [];
        normalized.usualVsCurrent.comparisonConclusion = availableSources.size > 1
            ? "過去の参考情報はありますが、通常傾向として比較できるだけの根拠が不足しています。"
            : "通常傾向と比較できる参考情報がないため、今回は比較していません。";
    }

    return normalized;
}

function validateEvidenceSources(
    result: KigenAnalysisResultV2,
    referenceContext: ReferenceContext,
): void {
    const availableSources = getAvailableSources(referenceContext);
    const claimedSources = [
        ...result.evidence.signalsForConcern.map((item) => item.source),
        ...result.evidence.signalsAgainstConcern.map((item) => item.source),
    ];
    const unavailableSource = claimedSources.find((source) => !availableSources.has(source));
    if (unavailableSource) {
        throw new AiOutputValidationError(
            "invalid",
            `利用できない参考情報を出典にしています: ${unavailableSource}`,
        );
    }
}

function validateConcernScore(
    key: "anger" | "coldness" | "distance",
    result: KigenAnalysisResultV2,
): void {
    const score = result.emotionScoreAnalysis.scores[key];
    if (score.score < 80) {
        return;
    }

    const hasSpecificReason = !GENERIC_REASON_PATTERNS.some((pattern) =>
        pattern.test(score.reason),
    );
    const hasEvidence = result.evidence.signalsForConcern.some((item) =>
        ["current_case", "person_profile", "recent_case", "feedback"].includes(item.source),
    );

    if (!hasSpecificReason || !hasEvidence) {
        throw new AiOutputValidationError(
            "invalid",
            `${key}の高スコアに具体的な根拠がありません。`,
        );
    }
}

function applyMinorCorrections(candidate: unknown): unknown {
    if (!candidate || typeof candidate !== "object") {
        return candidate;
    }

    // 入力を破壊せず、ネストした全文字列へ限定的な完全一致置換だけを適用します。
    return JSON.parse(
        JSON.stringify(candidate, (_key, value: unknown) => {
            if (typeof value !== "string") {
                return value;
            }

            return MINOR_REPLACEMENTS.reduce(
                (current, [pattern, replacement]) => current.replace(pattern, replacement),
                value,
            );
        }),
    );
}
