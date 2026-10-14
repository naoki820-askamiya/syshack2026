import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../prisma/client.js";
import type { KigenAnalysisResultV2 } from "../ai/v2/output.schema.js";
import type { AnalysisContextSnapshotV5 } from "../ai/v2/context.js";
import { reserveAnalyzeUsageAndStartCase } from "./rateLimit.js";
import { buildPersonSnapshot } from "./schemas.js";
import { resourceNotFound } from "./http.js";
import { assertSameCreateIntent, caseIntentFingerprint, isCreateIntentCollision } from './createIntent.js';

export async function createCase(
    userId: string,
    input: {
        personId: string;
        userAgeRange: string;
        userGender: string;
        perceivedPartnerReaction: string;
        elapsedTimeType: string;
        eventFacts: string;
        userResponseType: string;
        userResponseText: string | null;
        personSnapshot?: Prisma.InputJsonValue;
        createIntentKey?: string;
    },
) {
    const intent = input.createIntentKey ? { createIntentKey: input.createIntentKey.toLowerCase(), createIntentFingerprint: caseIntentFingerprint(input) } : {};
    try { return await prisma.$transaction(async tx => {
        // A short shared row lock orders snapshot+insert against Person UPDATE/archive.
        // Caller-supplied snapshots are never authoritative, including internal stale drafts.
        const people = await tx.$queryRaw<Array<{ displayName: string; relationshipType: string }>>`
            SELECT display_name AS "displayName", relationship_type AS "relationshipType"
            FROM persons
            WHERE id = ${input.personId}::uuid AND user_id = ${userId}::uuid AND archived_at IS NULL
            FOR SHARE
        `;
        if (!people[0]) throw resourceNotFound();
        return tx.analysisCase.create({ data: { ...input, userId, ...intent, personSnapshot: buildPersonSnapshot(people[0]) } });
    }); } catch (error) {
        // PostgreSQL aborts a transaction on UNIQUE failure; replay only after rollback.
        if (!intent.createIntentKey || !isCreateIntentCollision(error, 'analysis_cases')) throw error;
        const existing = await prisma.analysisCase.findFirst({ where: { userId, createIntentKey: intent.createIntentKey } });
        if (!existing || !await prisma.person.findFirst({ where: { userId, id: existing.personId, archivedAt: null } })) throw resourceNotFound();
        assertSameCreateIntent(existing.createIntentFingerprint, intent.createIntentFingerprint!);
        return existing;
    }
}

export async function findOwnedCase(userId: string, caseId: string) {
    // 所有権をクエリ条件へ含め、他ユーザーのcaseも一律not foundとして扱えるようにします。
    return prisma.analysisCase.findFirst({ where: { id: caseId, userId } });
}

export async function startAnalysis(userId: string, caseId: string) {
    return prisma.$transaction(async (tx) => {
        // 同じcaseの開始判定を直列化します。SELECT 1はPrismaがvoid戻り値を扱えないため必要です。
        await tx.$queryRaw<Array<{ locked: number }>>`
            SELECT 1 AS locked
            FROM pg_advisory_xact_lock(hashtextextended(${`analysis-case:${caseId}`}, 0))
        `;
        const current = await tx.analysisCase.findFirst({
            where: { id: caseId, userId },
            select: { status: true },
        });
        if (!current) return { kind: "not_found" as const };
        if (current.status === "analyzing") return { kind: "analyzing" as const };
        if (current.status === "analyzed") return { kind: "analyzed" as const };

        const reservation = await reserveAnalyzeUsageAndStartCase(tx, userId, caseId);
        return { kind: "started" as const, ...reservation };
    });
}

export async function completeAnalysis(input: {
    userId: string;
    caseId: string;
    analyzeRunId: string;
    promptVersion: string;
    resultSchemaVersion: string;
    model: string;
    result: KigenAnalysisResultV2;
    context: AnalysisContextSnapshotV5;
    usedCaseIds: string[];
    usedFeedbackIds: string[];
    personProfileId: string | null;
    userPatternSummaryId: string | null;
}) {
    return prisma.$transaction(async (tx) => {
        // 状態更新と結果保存を同一SQLにし、run idが一致しない古い非同期結果を保存させません。
        // versionはcase内の論理順序なので、時刻ではなく既存versionの最大値から採番します。
        const rows = await tx.$queryRaw<Array<{
            id: string;
            version: number;
            created_at: Date;
        }>>(
            Prisma.sql`
                WITH updated_case AS (
                    UPDATE analysis_cases
                    SET
                        status = 'analyzed',
                        last_analyzed_at = now(),
                        failure_code = NULL,
                        failure_message = NULL
                    WHERE user_id = ${input.userId}::uuid
                      AND id = ${input.caseId}::uuid
                      AND status = 'analyzing'
                      AND analyze_run_id = ${input.analyzeRunId}::uuid
                    RETURNING id, user_id, analyze_run_id
                ),
                next_version AS (
                    SELECT COALESCE(MAX(ar.version), 0) + 1 AS version
                    FROM updated_case uc
                    LEFT JOIN analysis_results ar ON ar.analysis_case_id = uc.id
                )
                INSERT INTO analysis_results (
                    user_id, analysis_case_id, analyze_run_id, version,
                    prompt_version, result_schema_version, model, result_json,
                    person_profile_id, user_pattern_summary_id,
                    used_case_ids, used_feedback_ids, context_json
                )
                SELECT
                    uc.user_id, uc.id, uc.analyze_run_id, nv.version,
                    ${input.promptVersion}, ${input.resultSchemaVersion}, ${input.model},
                    ${JSON.stringify(input.result)}::jsonb,
                    ${input.personProfileId}::uuid,
                    ${input.userPatternSummaryId}::uuid,
                    ${input.usedCaseIds}::uuid[],
                    ${input.usedFeedbackIds}::uuid[],
                    ${JSON.stringify(input.context)}::jsonb
                FROM updated_case uc
                CROSS JOIN next_version nv
                RETURNING id, version, created_at
            `,
        );
        return rows[0] ?? null;
    });
}

export async function failAnalysis(input: {
    userId: string;
    caseId: string;
    analyzeRunId: string;
    failureCode: string;
    failureMessage: string;
}) {
    // 新しい実行を古い失敗応答で上書きしないよう、開始時のrun idまで更新条件に含めます。
    return prisma.analysisCase.updateMany({
        where: {
            id: input.caseId,
            userId: input.userId,
            status: "analyzing",
            analyzeRunId: input.analyzeRunId,
        },
        data: {
            status: "failed",
            failureCode: input.failureCode,
            failureMessage: input.failureMessage,
        },
    });
}

type AnalysisRunState = {
    status: string;
    analyzeRunId: string | null;
    analyzeStartedAt: Date | null;
};

export function isStaleAnalysis(state: AnalysisRunState, cutoff: Date): boolean {
    if (!Number.isFinite(cutoff.getTime())) throw new RangeError("Invalid stale analysis cutoff");
    return state.status === "analyzing" && state.analyzeRunId !== null &&
        state.analyzeStartedAt !== null && state.analyzeStartedAt.getTime() < cutoff.getTime();
}

export async function recoverStaleAnalysis(input: {
    userId: string;
    caseId: string;
    analyzeRunId: string;
    cutoff: Date;
}) {
    // The caller chooses the cutoff; this helper does not install a scheduler or production threshold.
    const cutoff = new Date(input.cutoff.getTime());
    if (!Number.isFinite(cutoff.getTime()) || cutoff.getTime() > Date.now()) {
        throw new RangeError("Invalid or future stale analysis cutoff");
    }
    const recovered = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw<Array<{ locked: number }>>`
            SELECT 1 AS locked
            FROM pg_advisory_xact_lock(hashtextextended(${`analysis-case:${input.caseId}`}, 0))
        `;
        const current = await tx.analysisCase.findFirst({
            where: { id: input.caseId, userId: input.userId },
            select: { status: true, analyzeRunId: true, analyzeStartedAt: true },
        });
        if (!current || current.analyzeRunId !== input.analyzeRunId || !isStaleAnalysis(current, cutoff)) {
            return { count: 0 };
        }
        // Completion or a new run that wins the race also makes this compare-and-swap fail safely.
        return tx.analysisCase.updateMany({
            where: {
                id: input.caseId, userId: input.userId, status: "analyzing",
                analyzeRunId: input.analyzeRunId, analyzeStartedAt: { lt: cutoff },
            },
            data: {
                status: "failed", failureCode: "ANALYSIS_STALE",
                failureMessage: "分析処理が途中で停止した可能性があります。",
            },
        });
    });
    if (recovered.count > 0) {
        try {
            console.info("analysis_stale_recovered", { caseId: input.caseId, runId: input.analyzeRunId, status: "failed" });
        } catch { /* Monitoring must not change an already committed recovery result. */ }
    }
    return recovered;
}

export async function findLatestResult(userId: string, caseId: string) {
    // 最新性の正本は生成時刻ではなくcase単位のversionです。
    return prisma.analysisResult.findFirst({
        where: { userId, analysisCaseId: caseId },
        orderBy: { version: "desc" },
    });
}

export async function listResults(userId: string, caseId: string, limit: number, offset: number) {
    return prisma.analysisResult.findMany({
        where: { userId, analysisCaseId: caseId },
        orderBy: { version: "desc" },
        take: limit,
        skip: offset,
    });
}

export async function listCases(userId: string, personId: string, limit: number, offset: number) {
    return prisma.analysisCase.findMany({
        where: { userId, personId },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
    });
}

export { prisma };
