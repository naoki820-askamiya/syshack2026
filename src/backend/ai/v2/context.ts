import { CONTEXT_SCHEMA_VERSION } from "./constants.js";
import type { AiAnalysisInput, ReferenceContext } from "./input.schema.js";

export interface AnalysisContextSnapshotV4 {
    schemaVersion: typeof CONTEXT_SCHEMA_VERSION;
    personalizationUsed: boolean;
    referenceContextSnapshot: {
        personProfileSnapshot: unknown | null;
        userPatternSummarySnapshot: null;
        usedFeedbacksSnapshot: ReferenceContext["recentFeedbacks"];
        usedCaseSummariesSnapshot: ReferenceContext["recentCaseSummaries"];
        usedContextSummary: {
            personProfileUsed: boolean;
            userPatternSummaryUsed: false;
            feedbackCount: number;
            recentCaseCount: number;
        };
    };
    displayText: string;
}

export function buildAiInput(input: AiAnalysisInput): string {
    return JSON.stringify(input);
}

export function buildContextSnapshot(
    referenceContext: ReferenceContext,
): AnalysisContextSnapshotV4 {
    const personProfileUsed = referenceContext.personProfile !== null;
    const feedbackCount = referenceContext.recentFeedbacks.length;
    const recentCaseCount = referenceContext.recentCaseSummaries.length;
    const personalizationUsed =
        personProfileUsed || feedbackCount > 0 || recentCaseCount > 0;

    return {
        schemaVersion: CONTEXT_SCHEMA_VERSION,
        personalizationUsed,
        referenceContextSnapshot: {
            personProfileSnapshot: referenceContext.personProfile,
            userPatternSummarySnapshot: null,
            usedFeedbacksSnapshot: structuredClone(referenceContext.recentFeedbacks),
            usedCaseSummariesSnapshot: structuredClone(referenceContext.recentCaseSummaries),
            usedContextSummary: {
                personProfileUsed,
                userPatternSummaryUsed: false,
                feedbackCount,
                recentCaseCount,
            },
        },
        displayText: personalizationUsed
            ? "この分析では、今回の入力内容と、許可された過去の参考情報を使用しました。"
            : "この分析では、今回の入力内容だけを参考にしました。",
    };
}
