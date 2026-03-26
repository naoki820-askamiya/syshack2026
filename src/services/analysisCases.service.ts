import { analyzeMood } from "../ai/analyze.ts";
import * as analysisCasesRepository from "../repositories/analysisCases.repository.ts";
import * as analysisResultsRepository from "../repositories/analysisResults.repository.ts";
import { getOwnedPersonOrThrow } from "./persons.service.ts";
import type {
    CreateAnalysisCaseBody,
    PaginationOptions,
    StoredAnalysisCase,
} from "../types/index.ts";
import {
    ANALYZE_TIMEOUT_MS,
    AppError,
    normalizeError,
    withTimeout,
} from "../utils/index.ts";

export async function createAnalysisCase(
    sessionId: string,
    data: CreateAnalysisCaseBody,
) {
    if (!sessionId) {
        throw new AppError({
            code: "SESSION_INVALID",
            message: "x-session-id is required",
            status: 401,
        });
    }

    if (
        !data?.personId?.trim() ||
        !data?.eventFacts?.trim()
    ) {
        throw new AppError({
            code: "VALIDATION_ERROR",
            message: "personId, eventFacts は必須です。",
            status: 422,
        });
    }

    const person = await getOwnedPersonOrThrow(sessionId, data.personId.trim());

    const analysisCase = await analysisCasesRepository.create({
        sessionId,
        personId: data.personId.trim(),
        person: {
            displayName: person.displayName,
            relationshipType: person.relationshipType,
            ageRange: person.ageRange,
            genderHint: person.genderHint,
            notes: person.notes,
        },
        analysisCase: sanitizeAnalysisCaseInput(data),
        status: "draft",
    });

    return { analysisCase };
}

export async function analyzeCase(sessionId: string, caseId: string) {
    const analysisCase = await getOwnedCaseOrThrow(sessionId, caseId);

    if (analysisCase.status === "analyzing") {
        throw new AppError({
            code: "ALREADY_ANALYZING",
            message: "このケースは現在分析中です。",
            status: 409,
        });
    }

    if (analysisCase.status === "analyzed") {
        throw new AppError({
            code: "ALREADY_ANALYZED",
            message: "このケースはすでに分析済みです。",
            status: 409,
        });
    }

    await analysisCasesRepository.updateStatus(caseId, "analyzing");

    try {
        const aiResult = await withTimeout(
            async () =>
                analyzeMood({
                    person: analysisCase.person,
                    analysisCase: analysisCase.analysisCase,
                }),
            ANALYZE_TIMEOUT_MS,
        );

        await analysisResultsRepository.upsert({
            analysisCaseId: caseId,
            result: aiResult,
        });

        await analysisCasesRepository.updateStatus(caseId, "analyzed");

        return {
            status: "analyzed",
            result: aiResult,
        };
    } catch (error) {
        await analysisCasesRepository.updateStatus(caseId, "error");

        const normalized = normalizeError(error);
        throw new AppError({
            code: normalized.code,
            message: normalized.message,
            status: normalized.status,
            cause: normalized.cause,
        });
    }
}

export async function getResult(sessionId: string, caseId: string) {
    const analysisCase = await getOwnedCaseOrThrow(sessionId, caseId);

    if (analysisCase.status !== "analyzed") {
        return {
            status: analysisCase.status,
            result: null,
        };
    }

    const savedResult = await analysisResultsRepository.findByCaseId(caseId);

    return {
        status: "analyzed",
        result: savedResult?.result ?? null,
    };
}

export async function getCasesByPerson(
    sessionId: string,
    personId: string,
    options: PaginationOptions,
) {
    await getOwnedPersonOrThrow(sessionId, personId);

    return analysisCasesRepository.findByPersonId(sessionId, personId, options);
}

async function getOwnedCaseOrThrow(sessionId: string, caseId: string): Promise<StoredAnalysisCase> {
    if (!sessionId) {
        throw new AppError({
            code: "SESSION_INVALID",
            message: "x-session-id is required",
            status: 401,
        });
    }

    const analysisCase = await analysisCasesRepository.findById(caseId);

    if (!analysisCase) {
        throw new AppError({
            code: "NOT_FOUND",
            message: "analysis case が見つかりません。",
            status: 404,
        });
    }

    if (analysisCase.sessionId !== sessionId) {
        throw new AppError({
            code: "FORBIDDEN",
            message: "この analysis case にはアクセスできません。",
            status: 403,
        });
    }

    return analysisCase;
}
function sanitizeAnalysisCaseInput(data: CreateAnalysisCaseBody) {
    return {
        eventFacts: String(data.eventFacts ?? "").trim(),
        selfMessage: String(data.selfMessage ?? "").trim(),
        partnerMessage: String(data.partnerMessage ?? "").trim(),
        recentConversationText: String(data.recentConversationText ?? "").trim(),
        appType: String(data.appType ?? "").trim(),
        userEmotion: String(data.userEmotion ?? "").trim(),
        assumedPartnerEmotion: String(data.assumedPartnerEmotion ?? "").trim(),
        partnerSpeakingStyle: String(data.partnerSpeakingStyle ?? "").trim(),
        contextNote: String(data.contextNote ?? "").trim(),
        concernText: String(data.concernText ?? "").trim(),
        emojiUsed: String(data.emojiUsed ?? "").trim(),
        toneType: String(data.toneType ?? "").trim(),
        messageLengthType: String(data.messageLengthType ?? "").trim(),
    };
}
