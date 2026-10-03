import {
    PROMPT_VERSION,
    RESULT_SCHEMA_VERSION,
} from "../ai/v2/constants.js";
import { analyzeMoodV2, AnalyzeMoodV2Error } from "../ai/v2/analyzeMood.js";
import { AppError } from "../utils/index.js";
import { buildAiContext } from "./context.repository.js";
import { parseOrThrow, resourceNotFound } from "./http.js";
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

export async function analyzeCase(
    userId: string,
    caseId: string,
    options: { requestId?: string; generate?: typeof analyzeMoodV2 } = {},
) {
    const totalStartedAt = performance.now();
    const duration: Record<string, number | null> = {
        db_start_ms: null, db_context_ms: null, ai_generation_ms: null, db_save_ms: null,
        // Non-streaming generation combines prompt/provider/validation; these are not separately observed.
        prompt_build_ms: null, provider_first_event_ms: null, provider_complete_ms: null, validation_ms: null,
        total_analysis_ms: null,
    };
    const counts = { recentCases: 0, feedbacks: 0, personProfiles: 0 };
    let stage = "db_start";
    let runId: string | null = null;
    let model: string | null = null;
    let actualAttempts = 0;
    let status = "failed";
    let failureCode: string | null = null;
    try {
        const startAt = performance.now();
        const started = await repository.startAnalysis(userId, caseId).finally(() => {
            duration.db_start_ms = elapsedMs(startAt);
        });
        if (started.kind === "not_found") throw resourceNotFound();
        if (started.kind === "analyzing") throw conflict("CASE_ALREADY_ANALYZING", "この相談は現在分析中です。");
        if (started.kind === "analyzed") throw conflict("CASE_ALREADY_ANALYZED", "この相談はすでに分析済みです。");
        runId = started.analyzeRunId;

        try {
            stage = "db_context";
            const contextAt = performance.now();
            const context = await buildAiContext(userId, caseId).finally(() => {
                duration.db_context_ms = elapsedMs(contextAt);
            });
            if (!context) throw resourceNotFound();
            counts.recentCases = context.usedCaseIds.length;
            counts.feedbacks = context.usedFeedbackIds.length;
            counts.personProfiles = context.personProfileId ? 1 : 0;

            stage = "ai_generation";
            const generationAt = performance.now();
            const generated = await (options.generate ?? analyzeMoodV2)(context.aiInput).finally(() => {
                duration.ai_generation_ms = elapsedMs(generationAt);
            });
            actualAttempts = generated.attempts;
            model = generated.model;
            stage = "db_save";
            const saveAt = performance.now();
            const saved = await repository.completeAnalysis({
                userId, caseId, analyzeRunId: started.analyzeRunId,
                promptVersion: PROMPT_VERSION, resultSchemaVersion: RESULT_SCHEMA_VERSION,
                model: generated.model, result: generated.analysis,
                context: context.contextSnapshot, usedCaseIds: context.usedCaseIds,
                usedFeedbackIds: context.usedFeedbackIds, personProfileId: context.personProfileId,
                userPatternSummaryId: context.userPatternSummaryId,
            }).finally(() => { duration.db_save_ms = elapsedMs(saveAt); });
            if (!saved) {
                throw new AppError({
                    code: "ANALYSIS_STALE",
                    message: "分析状態が更新されたため、古い結果は保存されませんでした。", status: 409,
                });
            }

            stage = "usage_settlement";
            await settleUsageOrLog(started.usageEventId, "succeeded", actualAttempts);
            status = "succeeded";
            return {
                status: "analyzed",
                result: {
                    id: saved.id, analysisCaseId: caseId, version: saved.version,
                    promptVersion: PROMPT_VERSION, resultSchemaVersion: RESULT_SCHEMA_VERSION,
                    model: generated.model, generatedAt: saved.created_at.toISOString(), analysis: generated.analysis,
                },
            };
        } catch (error) {
            if (error instanceof AnalyzeMoodV2Error) actualAttempts = error.attempts;
            const normalized = normalizeAnalysisError(error);
            // Compensation and usage settlement stay independent; rejected state recovery is observable.
            const compensation = await Promise.allSettled([
                repository.failAnalysis({
                    userId, caseId, analyzeRunId: started.analyzeRunId,
                    failureCode: normalized.code, failureMessage: normalized.message,
                }),
                settleUsageOrLog(started.usageEventId, "failed", actualAttempts),
            ]);
            if (compensation[0].status === "rejected") {
                safeWorkflowLog("error", "analysis_compensation_required", {
                    caseId, runId, usageEventId: started.usageEventId, errorStage: "state_compensation",
                    errorName: compensation[0].reason instanceof Error ? compensation[0].reason.constructor.name : "UnknownError",
                });
            }
            throw normalized;
        }
    } catch (error) {
        failureCode = error instanceof AppError ? error.code : "AI_PROVIDER_ERROR";
        throw error;
    } finally {
        duration.total_analysis_ms = elapsedMs(totalStartedAt);
        safeWorkflowLog("info", "analysis_timing", {
            // Only UUID-shaped correlation IDs are logged; arbitrary client header text is not copied.
            requestId: options.requestId && /^(?:req_)?[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu.test(options.requestId)
                ? options.requestId : null,
            caseId, runId, model, promptVersion: PROMPT_VERSION, schemaVersion: RESULT_SCHEMA_VERSION,
            attempt: actualAttempts, status, errorStage: status === "succeeded" ? null : stage,
            failureCode, counts, duration,
        });
    }
}

function elapsedMs(startedAt: number): number {
    return Math.round(Math.max(0, performance.now() - startedAt) * 100) / 100;
}

function safeWorkflowLog(level: "info" | "error", event: string, metadata: Record<string, unknown>): void {
    try { console[level](event, metadata); } catch { /* Monitoring must not change a business result. */ }
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
    if (!analysisCase) throw resourceNotFound();
    return analysisCase;
}

type StoredAnalysisResult = NonNullable<Awaited<ReturnType<typeof repository.findLatestResult>>>;

function toResultEnvelope(result: StoredAnalysisResult) {
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

async function settleUsageOrLog(
    usageEventId: string,
    status: "succeeded" | "failed",
    actualAttempts: number,
): Promise<void> {
    try {
        await settleUsage(repository.prisma, usageEventId, status, actualAttempts);
    } catch (error) {
        // 利用量集計は運用上補正できるため、分析結果やcase復旧の成否を巻き戻しません。
        safeWorkflowLog("error", "usage_reconciliation_required", {
            usageEventId,
            status,
            errorName: error instanceof Error ? error.name : "UnknownError",
        });
    }
}

function normalizeAnalysisError(error: unknown): AppError {
    if (error instanceof AppError) return error;
    if (error instanceof AnalyzeMoodV2Error) {
        return new AppError({
            code: error.code,
            message: "分析結果を生成できませんでした。少し時間をおいて再度お試しください。",
            status: analysisFailureStatus(error.code),
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

function analysisFailureStatus(code: AnalyzeMoodV2Error["code"]): number {
    if (code === "AI_CONFIG_MISSING") return 500;
    if (code === "AI_TIMEOUT") return 504;
    return 502;
}

function conflict(code: string, message: string) {
    return new AppError({ code, message, status: 409 });
}
