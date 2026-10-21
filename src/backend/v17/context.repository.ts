import { prisma } from "../prisma/client.js";
import { Prisma } from "../generated/prisma/client.js";
import type { ReferenceContext, SourceProvenance } from "../ai/v2/input.schema.js";
import { buildContextSnapshot } from "../ai/v2/context.js";

export async function buildAiContext(userId: string, caseId: string) {
    const analysisCase = await prisma.analysisCase.findFirst({
        where: { id: caseId, userId },
    });

    if (!analysisCase) {
        return null;
    }

    // 後からPersonが更新されても、相談作成時に確定した文脈で分析を再現できるようsnapshotを使います。
    const personSnapshot = readPersonSnapshot(analysisCase.personSnapshot);
    const privacy = await prisma.userPrivacySetting.upsert({
        where: { userId },
        create: { userId },
        update: {},
    });

    const referenceContext: ReferenceContext = {
        personProfile: null,
        userPatternSummary: null,
        recentCaseSummaries: [],
        recentFeedbacks: [],
        provenance: {
            currentCase: sourceProvenance("analysis_case", caseId, "user_provided_fact"),
            personSnapshot: sourceProvenance("person_snapshot", caseId, "user_provided_fact"),
            personProfile: null,
        },
    };
    // AI-generated summaries/Profile can carry instructions across runs. Keep
    // stored originals, but do not retrieve or reinsert them into a new model input.
    if (privacy.personalizationEnabled && privacy.useFeedbackForContext) {
        referenceContext.recentFeedbacks = await findAllowedFeedbacks(userId, analysisCase.personId);
    }

    return {
        analysisCase,
        aiInput: {
            referenceContext,
            untrustedUserInput: {
                person: personSnapshot,
                currentCase: {
                    userAgeRange: analysisCase.userAgeRange,
                    userGender: analysisCase.userGender,
                    perceivedPartnerReaction: analysisCase.perceivedPartnerReaction,
                    elapsedTimeType: analysisCase.elapsedTimeType,
                    eventFacts: analysisCase.eventFacts,
                    userResponseType: analysisCase.userResponseType as "action" | "conversation" | "none",
                    userResponseText: analysisCase.userResponseText,
                },
            },
        },
        contextSnapshot: buildContextSnapshot(referenceContext),
        usedCaseIds: referenceContext.recentCaseSummaries.map((item) => item.analysisCaseId),
        usedFeedbackIds: referenceContext.recentFeedbacks.map((item) => item.feedbackId),
        personProfileId: null,
        userPatternSummaryId: null,
    };
}

async function findAllowedFeedbacks(
    userId: string,
    personId: string,
): Promise<ReferenceContext["recentFeedbacks"]> {
    const feedbacks = await prisma.analysisFeedback.findMany({
        where: {
            userId,
            allowPersonalizationUse: true,
            analysisCase: { personId },
        },
        orderBy: { createdAt: "desc" },
        take: 3,
        select: {
            id: true,
            actualOutcome: true,
            overreadScore: true,
            outcomeNote: true,
        },
    });

    return feedbacks.map((feedback) => ({
        feedbackId: feedback.id,
        actualOutcome: feedback.actualOutcome,
        overreadScore: feedback.overreadScore,
        outcomeNote: feedback.outcomeNote,
        provenance: sourceProvenance("analysis_feedback", feedback.id, "user_feedback"),
    }));
}

function readPersonSnapshot(value: Prisma.JsonValue) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("person_snapshot is invalid");
    }
    const person = value.person;
    if (!person || typeof person !== "object" || Array.isArray(person)) {
        throw new Error("person_snapshot.person is invalid");
    }
    const displayName = person.displayName;
    const relationshipType = person.relationshipType;
    if (typeof displayName !== "string" || typeof relationshipType !== "string") {
        throw new Error("person_snapshot.person fields are invalid");
    }
    return { displayName, relationshipType };
}

function sourceProvenance(
    sourceType: SourceProvenance["sourceType"], sourceId: string,
    kind: SourceProvenance["kind"], generatedAt: Date | null = null,
): SourceProvenance {
    return {
        sourceType, sourceId, kind,
        generatedAt: generatedAt?.toISOString() ?? null,
        observedAt: null, userConfirmed: false,
    };
}
