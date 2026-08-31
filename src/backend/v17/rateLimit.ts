import { Prisma } from "../generated/prisma/client.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import { MAX_INTERNAL_AI_ATTEMPTS } from "../ai/v2/constants.js";
import { AppError } from "../utils/index.js";

type TransactionClient = Prisma.TransactionClient;

interface Policy {
    id: string;
    policyKey: string;
    windowType: string;
    windowSeconds: number | null;
    resetTimezone: string | null;
    maxRequests: number | null;
    maxCostUnits: number | null;
}

export interface UsageReservation {
    usageEventId: string;
    analyzeRunId: string;
}

export async function reserveAnalyzeUsageAndStartCase(
    tx: TransactionClient,
    userId: string,
    caseId: string,
): Promise<UsageReservation> {
    const policies = await tx.rateLimitPolicy.findMany({
        where: {
            routeKey: "analyze",
            subjectType: "user",
            isEnabled: true,
        },
        orderBy: [{ priority: "asc" }, { policyKey: "asc" }],
    }) as Policy[];

    if (policies.length === 0 && process.env.NODE_ENV === "production") {
        throw new AppError({
            code: "AI_CONFIG_MISSING",
            message: "AI利用上限のサーバー設定が不足しています。",
            status: 500,
        });
    }

    const lockKeys = policies
        .map((policy) => `${policy.policyKey}:user:${userId}`)
        // 複数policyを全リクエストで同じ順にlockし、相互待ちを避けます。
        .sort();

    for (const lockKey of lockKeys) {
        // 上限確認と予約を直列化します。SELECT 1はPrismaがvoid戻り値を扱えないため必要です。
        await tx.$queryRaw<Array<{ locked: number }>>`
            SELECT 1 AS locked
            FROM pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
        `;
    }

    for (const policy of policies) {
        const [usage] = await tx.$queryRaw<Array<{ requests: bigint; cost: bigint }>>(
            Prisma.sql`
                SELECT
                    COUNT(*)::bigint AS requests,
                    COALESCE(SUM(cost_units), 0)::bigint AS cost
                FROM api_usage_events
                WHERE route_key = 'analyze'
                  AND user_id = ${userId}::uuid
                  AND status IN ('allowed', 'succeeded', 'failed')
                  AND created_at >= ${windowStartSql(policy)}
            `,
        );

        const requests = Number(usage?.requests ?? 0n);
        const cost = Number(usage?.cost ?? 0n);
        const requestExceeded =
            policy.maxRequests !== null && requests + 1 > policy.maxRequests;
        const costExceeded =
            policy.maxCostUnits !== null &&
            cost + MAX_INTERNAL_AI_ATTEMPTS > policy.maxCostUnits;

        if (requestExceeded || costExceeded) {
            throw new AppError({
                code: "AI_RATE_LIMITED",
                message: "AI分析の利用上限に達しました。時間をおいて再度お試しください。",
                status: 429,
            });
        }
    }

    const usageEvent = await tx.apiUsageEvent.create({
        data: {
            userId,
            routeKey: "analyze",
            costUnits: MAX_INTERNAL_AI_ATTEMPTS,
            status: "allowed",
        },
    });

    // 実行ごとのrun idを後続の完了・失敗条件に使い、古い応答による上書きを防ぎます。
    const started = await tx.$queryRaw<Array<{ analyze_run_id: string }>>`
        UPDATE analysis_cases
        SET
            status = 'analyzing',
            analyze_run_id = gen_random_uuid(),
            analyze_started_at = now(),
            analyze_attempt_count = analyze_attempt_count + 1,
            failure_code = NULL,
            failure_message = NULL
        WHERE user_id = ${userId}::uuid
          AND id = ${caseId}::uuid
          AND status IN ('draft', 'failed')
        RETURNING analyze_run_id
    `;

    if (!started[0]) {
        throw new AppError({
            code: "CASE_STATE_CONFLICT",
            message: "分析を開始できる状態ではありません。",
            status: 409,
        });
    }

    return {
        usageEventId: usageEvent.id,
        analyzeRunId: started[0].analyze_run_id,
    };
}

export async function settleUsage(
    prisma: PrismaClient,
    usageEventId: string,
    status: "succeeded" | "failed",
    actualAttempts: number,
): Promise<void> {
    await prisma.apiUsageEvent.updateMany({
        where: { id: usageEventId, status: "allowed" },
        data: {
            status,
            costUnits: Math.max(0, Math.min(MAX_INTERNAL_AI_ATTEMPTS, actualAttempts)),
        },
    });
}

function windowStartSql(policy: Policy): Prisma.Sql {
    if (policy.windowType === "rolling") {
        if (!policy.windowSeconds || policy.windowSeconds <= 0) {
            throw new AppError({
                code: "AI_CONFIG_MISSING",
                message: "Rate Limit policyのwindow設定が不正です。",
                status: 500,
            });
        }
        return Prisma.sql`now() - (${policy.windowSeconds} * interval '1 second')`;
    }

    const timezone = policy.resetTimezone ?? "UTC";
    return Prisma.sql`date_trunc('day', now() AT TIME ZONE ${timezone}) AT TIME ZONE ${timezone}`;
}
