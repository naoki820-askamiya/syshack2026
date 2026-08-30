import { prisma } from "../prisma/client.js";
import { Prisma } from "../generated/prisma/client.js";
import type { ReferenceContext } from "../ai/v2/input.schema.js";
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
    };
    let personProfileId: string | null = null;

    if (privacy.personalizationEnabled) {
        if (privacy.usePersonProfile) {
            const profile = await findPersonProfile(userId, analysisCase.personId);
            personProfileId = profile?.id ?? null;
            referenceContext.personProfile = profile?.profileJson ?? null;
        }

        referenceContext.recentCaseSummaries = await findRecentCaseSummaries(
            userId,
            analysisCase.personId,
            caseId,
        );

        if (privacy.useFeedbackForContext) {
            referenceContext.recentFeedbacks = await findAllowedFeedbacks(
                userId,
                analysisCase.personId,
            );
        }
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
        personProfileId,
        userPatternSummaryId: null,
    };
}

function findPersonProfile(userId: string, personId: string) {
    return prisma.personProfile.findFirst({
        where: { userId, personId },
        select: { id: true, profileJson: true },
    });
}

async function findRecentCaseSummaries(
    userId: string,
    personId: string,
    excludedCaseId: string,
): Promise<ReferenceContext["recentCaseSummaries"]> {
    const recentCases = await prisma.analysisCase.findMany({
        where: {
            userId,
            personId,
            id: { not: excludedCaseId },
            status: "analyzed",
        },
        orderBy: { lastAnalyzedAt: "desc" },
        take: 3,
        select: {
            id: true,
            results: {
                // 同一case内の最新性は生成時刻ではなくversionで決まります。
                orderBy: { version: "desc" },
                take: 1,
                select: { resultJson: true },
            },
        },
    });

    return recentCases.flatMap((recentCase) => {
        const latestResult = recentCase.results[0];
        const summary = latestResult ? readSummary(latestResult.resultJson) : null;
        return summary ? [{ analysisCaseId: recentCase.id, summary }] : [];
    });
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

function readSummary(value: Prisma.JsonValue): string | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const summary = value.summary;
    if (!summary || typeof summary !== "object" || Array.isArray(summary)) return null;
    return typeof summary.oneLine === "string" ? summary.oneLine.slice(0, 500) : null;
}
