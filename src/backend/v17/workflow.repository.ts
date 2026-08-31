import { Prisma } from "../generated/prisma/client.js";
import { prisma } from "../prisma/client.js";
import type { KigenAnalysisResultV2 } from "../ai/v2/output.schema.js";
import type { AnalysisContextSnapshotV4 } from "../ai/v2/context.js";
import { reserveAnalyzeUsageAndStartCase } from "./rateLimit.js";

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
        personSnapshot: Prisma.InputJsonValue;
    },
) {
    return prisma.analysisCase.create({ data: { ...input, userId } });
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
    context: AnalysisContextSnapshotV4;
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
