import {
    kigenAnalysisResultV2Schema,
    type KigenAnalysisResultV2,
} from "./output.schema.js";
import type { ReferenceContext } from "./input.schema.js";

const MINOR_REPLACEMENTS: ReadonlyArray<[RegExp, string]> = [
    [/相手は怒っています/g, "怒りや不満が含まれている可能性があります"],
    [/相手はあなたを嫌っています/g, "相手が距離を置いている可能性もあります"],
];

const UNSAFE_ASSERTION_PATTERNS = [
    /絶対に.{0,12}(怒|嫌)/u,
    /間違いなく.{0,12}(嫌|怒)/u,
    /あなたは認知が歪んで/u,
    /診断結果/u,
    /嫌われ度/u,
    /脈なし度/u,
    /危険度/u,
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

    validateFieldSafety(validated);

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

// These field/phrase checks cover known regressions, not a complete Japanese safety policy.
const AGGRESSIVE_ACTION_PATTERN = /(殴(?:る|って|り|れ)|蹴(?:る|って|り|れ)|脅(?:す|して|し|せ)|晒(?:す|して|し|せ)|仕返し|復讐|追い詰め(?:る|て|ろ))/gu;
const DIRECT_INSTRUCTION_PATTERN = /(ましょう|してください|しよう|べき|おすすめ|お勧め|しなさい|してよい|してもよい|必要があります)/u;

function validateFieldSafety(result: KigenAnalysisResultV2): void {
    visitStrings(result, [], (text, path) => {
        const field = path.join(".");
        const assertionText = maskDiscussedQuotes(text);
        if (UNSAFE_ASSERTION_PATTERNS.some(pattern => pattern.test(assertionText))) {
            rejectUnsafeField(field);
        }

        const avoidedLabel = path[0] === "avoidActions" && path[2] === "label";
        for (const match of text.matchAll(AGGRESSIVE_ACTION_PATTERN)) {
            const end = match.index! + match[0].length;
            if (isExplicitAvoidance(text.slice(end))) continue;
            // An avoidActions label names what to avoid; it must not explicitly urge the action.
            if (avoidedLabel && !DIRECT_INSTRUCTION_PATTERN.test(text)) continue;
            // Preserve the existing deny behavior outside the specific avoided/negated cases.
            rejectUnsafeField(field);
        }
    });
}

function rejectUnsafeField(field: string): never {
    throw new AiOutputValidationError(
        "unsafe", "AI出力に禁止表現または危険な直接指示が含まれています。", { field },
    );
}

function visitStrings(value: unknown, path: string[], visit: (text: string, path: string[]) => void): void {
    if (typeof value === "string") { visit(value, path); return; }
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) visitStrings(child, [...path, key], visit);
}

function isExplicitAvoidance(suffix: string): boolean {
    // Only complete affirmative avoidance endings are allowed. Unknown continuations stay denied.
    return /^(?:こと|の)?(?:は|を)?(?:避ける|避けましょう|控える|控えましょう|やめる|やめましょう|しない|ない)[。.!！？?]?\s*$/u.test(suffix);
}

function maskDiscussedQuotes(text: string): string {
    return text.replace(/[「『]([^」』]*)[」』]/gu, (quote, _content: string, offset: number) => {
        const suffix = text.slice(offset + quote.length);
        const explicitDisclaimer = /^と(?:は(?:言え|断定でき)ません|断定(?:する)?(?:ことは)?(?:できません|しません)|決めつけ(?:る)?(?:ことは)?(?:できません|ません))/u.test(suffix);
        return explicitDisclaimer ? "引用内容" : quote;
    });
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
