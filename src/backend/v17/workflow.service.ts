import {
    PROMPT_VERSION,
    RESULT_SCHEMA_VERSION,
} from "../ai/v2/constants.js";
import { analyzeMoodV2, AnalyzeMoodV2Error } from "../ai/v2/analyzeMood.js";
import { AppError } from "../utils/index.js";
import { buildAiContext } from "./context.repository.js";
import { parseOrThrow } from "./http.js";
import { paginationSchema, buildPersonSnapshot, createAnalysisCaseSchema } from "./schemas.js";
import { getOwnedPersonOrThrow } from "./persons.service.js";
import { settleUsage } from "./rateLimit.js";
import * as repository from "./workflow.repository.js";

export async function createAnalysisCase(userId: string, body: unknown) {
    const data = parseOrThrow(createAnalysisCaseSchema, body);
    const person = await getOwnedPersonOrThrow(userId, data.personId);
    const analysisCase = await repository.createCase(userId, {
        ...data,
        personSnapshot: buildPersonSnapshot(person),
    });
    return { analysisCase };
}

export async function getAnalysisCase(userId: string, caseId: string) {
    const analysisCase = await ownedCaseOrThrow(userId, caseId);
    return { analysisCase };
}

export async function analyzeCase(userId: string, caseId: string) {
    const started = await repository.startAnalysis(userId, caseId);
    if (started.kind === "not_found") throw notFound();
    if (started.kind === "analyzing") {
        throw conflict("CASE_ALREADY_ANALYZING", "この相談は現在分析中です。");
    }
    if (started.kind === "analyzed") {
        throw conflict("CASE_ALREADY_ANALYZED", "この相談はすでに分析済みです。");
    }

    let actualAttempts = 0;
    try {
        const context = await buildAiContext(userId, caseId);
        if (!context) throw notFound();

        const generated = await analyzeMoodV2(context.aiInput);
        actualAttempts = generated.attempts;
        const saved = await repository.completeAnalysis({
            userId,
            caseId,
            analyzeRunId: started.analyzeRunId,
            promptVersion: PROMPT_VERSION,
            resultSchemaVersion: RESULT_SCHEMA_VERSION,
            model: generated.model,
            result: generated.analysis,
            context: context.contextSnapshot,
            usedCaseIds: context.usedCaseIds,
            usedFeedbackIds: context.usedFeedbackIds,
            personProfileId: context.personProfileId,
            userPatternSummaryId: context.userPatternSummaryId,
        });

        if (!saved) {
            throw new AppError({
                code: "ANALYSIS_STALE",
                message: "分析状態が更新されたため、古い結果は保存されませんでした。",
                status: 409,
            });
        }

        try {
            await settleUsage(repository.prisma, started.usageEventId, "succeeded", actualAttempts);
        } catch (usageError) {
            console.error("usage_reconciliation_required", {
                usageEventId: started.usageEventId,
                status: "succeeded",
                errorName: usageError instanceof Error ? usageError.name : "UnknownError",
            });
        }
        return {
            status: "analyzed",
            result: {
                id: saved.id,
                analysisCaseId: caseId,
                version: saved.version,
                promptVersion: PROMPT_VERSION,
                resultSchemaVersion: RESULT_SCHEMA_VERSION,
                model: generated.model,
                generatedAt: saved.created_at.toISOString(),
                analysis: generated.analysis,
            },
        };
    } catch (error) {
        if (error instanceof AnalyzeMoodV2Error) actualAttempts = error.attempts;
        const normalized = normalizeAnalysisError(error);

        const [, usageSettlement] = await Promise.allSettled([
            repository.failAnalysis({
                userId,
                caseId,
                analyzeRunId: started.analyzeRunId,
                failureCode: normalized.code,
                failureMessage: normalized.message,
            }),
            settleUsage(repository.prisma, started.usageEventId, "failed", actualAttempts),
        ]);
        if (usageSettlement.status === "rejected") {
            console.error("usage_reconciliation_required", {
                usageEventId: started.usageEventId,
                status: "failed",
                errorName: usageSettlement.reason instanceof Error
                    ? usageSettlement.reason.name
                    : "UnknownError",
            });
        }
        throw normalized;
    }
}

export async function getLatestResult(userId: string, caseId: string) {
    await ownedCaseOrThrow(userId, caseId);
    const result = await repository.findLatestResult(userId, caseId);
    return { result: result ? toResultEnvelope(result) : null };
}

export async function listResults(userId: string, caseId: string, query: unknown) {
    await ownedCaseOrThrow(userId, caseId);
    const parsed = parseOrThrow(paginationSchema, query);
    const limit = parsed.limit ?? 20;
    const offset = parsed.offset ?? 0;
    const results = await repository.listResults(userId, caseId, limit, offset);
    return {
        results: results.map(toResultEnvelope),
        pagination: { limit, offset, hasMore: results.length === limit },
    };
}

export async function listCasesByPerson(
    userId: string,
    personId: string,
    query: unknown,
) {
    await getOwnedPersonOrThrow(userId, personId);
    const parsed = parseOrThrow(paginationSchema, query);
    const limit = parsed.limit ?? 20;
    const offset = parsed.offset ?? 0;
    const analysisCases = await repository.listCases(userId, personId, limit, offset);
    return {
        analysisCases,
        pagination: { limit, offset, hasMore: analysisCases.length === limit },
    };
}

async function ownedCaseOrThrow(userId: string, caseId: string) {
    const analysisCase = await repository.findOwnedCase(userId, caseId);
    if (!analysisCase) throw notFound();
    return analysisCase;
}

function toResultEnvelope(result: Awaited<ReturnType<typeof repository.findLatestResult>> & {}) {
    return {
        id: result.id,
        analysisCaseId: result.analysisCaseId,
        version: result.version,
        promptVersion: result.promptVersion,
        resultSchemaVersion: result.resultSchemaVersion,
        model: result.model,
        generatedAt: result.createdAt.toISOString(),
        analysis: result.resultJson,
    };
}

function normalizeAnalysisError(error: unknown): AppError {
    if (error instanceof AppError) return error;
    if (error instanceof AnalyzeMoodV2Error) {
        const status = error.code === "AI_CONFIG_MISSING"
            ? 500
            : error.code === "AI_TIMEOUT"
                ? 504
                : 502;
        return new AppError({
            code: error.code,
            message: "分析結果を生成できませんでした。少し時間をおいて再度お試しください。",
            status,
            cause: error,
        });
    }
    return new AppError({
        code: "AI_PROVIDER_ERROR",
        message: "分析結果を生成できませんでした。少し時間をおいて再度お試しください。",
        status: 502,
        cause: error,
    });
}

function conflict(code: string, message: string) {
    return new AppError({ code, message, status: 409 });
}

function notFound() {
    return new AppError({
        code: "RESOURCE_NOT_FOUND",
        message: "対象が見つかりません。",
        status: 404,
    });
}
