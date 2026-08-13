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

    const personSnapshot = readPersonSnapshot(analysisCase.personSnapshot);
    const privacy = await prisma.userPrivacySetting.upsert({
        where: { userId },
        create: { userId },
        update: {},
    });

    let personProfileId: string | null = null;
    const referenceContext: ReferenceContext = {
        personProfile: null,
        userPatternSummary: null,
        recentCaseSummaries: [],
        recentFeedbacks: [],
    };

    if (privacy.personalizationEnabled) {
        if (privacy.usePersonProfile) {
            const profile = await prisma.personProfile.findFirst({
                where: { userId, personId: analysisCase.personId },
                select: { id: true, profileJson: true },
            });
            personProfileId = profile?.id ?? null;
            referenceContext.personProfile = profile?.profileJson ?? null;
        }

        const recentCases = await prisma.analysisCase.findMany({
            where: {
                userId,
                personId: analysisCase.personId,
                id: { not: caseId },
                status: "analyzed",
            },
            orderBy: { lastAnalyzedAt: "desc" },
            take: 3,
            select: {
                id: true,
                results: {
                    orderBy: { version: "desc" },
                    take: 1,
                    select: { resultJson: true },
                },
            },
        });
        referenceContext.recentCaseSummaries = recentCases.flatMap((recentCase) => {
            const latestResult = recentCase.results[0];
            const summary = latestResult ? readSummary(latestResult.resultJson) : null;
            return summary ? [{ analysisCaseId: recentCase.id, summary }] : [];
        });

        if (privacy.useFeedbackForContext) {
            const feedbacks = await prisma.analysisFeedback.findMany({
                where: {
                    userId,
                    allowPersonalizationUse: true,
                    analysisCase: { personId: analysisCase.personId },
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
            referenceContext.recentFeedbacks = feedbacks.map((feedback) => ({
                feedbackId: feedback.id,
                actualOutcome: feedback.actualOutcome,
                overreadScore: feedback.overreadScore,
                outcomeNote: feedback.outcomeNote,
            }));
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
