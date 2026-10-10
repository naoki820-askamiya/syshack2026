import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/kigen404_test";

const [{ prisma }, repository, rateLimit] = await Promise.all([
    import("../prisma/client.js"),
    import("./workflow.repository.js"),
    import("./rateLimit.js"),
]);

const USER_ID = "11111111-1111-4111-8111-111111111111";
const CASE_ID = "55555555-5555-4555-8555-555555555555";
const RUN_ID = "88888888-8888-4888-8888-888888888888";

function replaceMethod<Implementation extends (...args: any[]) => any>(
    t: test.TestContext,
    target: object,
    methodName: string,
    implementation: Implementation,
) {
    const methods = target as Record<string, unknown>;
    const original = methods[methodName];
    const replacement = t.mock.fn(implementation);
    methods[methodName] = replacement;
    t.after(() => {
        methods[methodName] = original;
    });
    return replacement;
}

function transactionForStatus(status: "draft" | "failed" | "analyzing" | "analyzed" | null) {
    const rawSql: string[] = [];
    const tx = {
        $queryRaw: async (first: TemplateStringsArray | { strings?: readonly string[] }) => {
            const queryStrings = (first as { strings?: readonly string[] }).strings;
            const sql = queryStrings
                ? queryStrings.join("")
                : Array.from(first as TemplateStringsArray).join("");
            rawSql.push(sql);
            if (sql.includes("UPDATE analysis_cases")) {
                return [{ analyze_run_id: RUN_ID }];
            }
            return [];
        },
        analysisCase: {
            findFirst: async (args: { where: unknown; select: unknown }) => {
                assert.deepEqual(args.where, { id: CASE_ID, userId: USER_ID });
                assert.deepEqual(args.select, { status: true });
                return status ? { status } : null;
            },
        },
        rateLimitPolicy: { findMany: async () => [] },
        apiUsageEvent: {
            create: async (args: { data: Record<string, unknown> }) => {
                assert.equal(args.data.userId, USER_ID);
                return { id: "usage-event-id" };
            },
        },
    };
    return { tx, rawSql };
}

test("only draft and failed AnalysisCases can start analysis", async (t) => {
    for (const status of ["draft", "failed"] as const) {
        const { tx, rawSql } = transactionForStatus(status);
        replaceMethod(t, prisma, "$transaction", async (callback) => callback(tx as never));
        const result = await repository.startAnalysis(USER_ID, CASE_ID);
        assert.deepEqual(result, {
            kind: "started",
            usageEventId: "usage-event-id",
            analyzeRunId: RUN_ID,
        });
        const lockSql = rawSql.find((sql) => sql.includes("pg_advisory_xact_lock"));
        assert.match(lockSql ?? "", /SELECT 1 AS locked/);
        assert.match(lockSql ?? "", /FROM pg_advisory_xact_lock/);
        const startSql = rawSql.find((sql) => sql.includes("UPDATE analysis_cases"));
        assert.match(startSql ?? "", /status = 'analyzing'/);
        assert.match(startSql ?? "", /analyze_run_id = gen_random_uuid\(\)/);
        assert.match(startSql ?? "", /status IN \('draft', 'failed'\)/);
    }
});

test("rate-limit advisory locks also return a scalar Prisma can deserialize", async () => {
    const rawSql: string[] = [];
    const tx = {
        $queryRaw: async (first: TemplateStringsArray | { strings?: readonly string[] }) => {
            const queryStrings = (first as { strings?: readonly string[] }).strings;
            const sql = queryStrings
                ? queryStrings.join("")
                : Array.from(first as TemplateStringsArray).join("");
            rawSql.push(sql);
            if (sql.includes("COUNT(*)")) return [{ requests: 0n, cost: 0n }];
            if (sql.includes("UPDATE analysis_cases")) return [{ analyze_run_id: RUN_ID }];
            return [{ locked: 1 }];
        },
        rateLimitPolicy: {
            findMany: async () => [{
                id: "policy-id",
                policyKey: "test-policy",
                windowType: "rolling",
                windowSeconds: 60,
                resetTimezone: null,
                maxRequests: 10,
                maxCostUnits: 10,
            }],
        },
        apiUsageEvent: { create: async () => ({ id: "usage-event-id" }) },
    };

    assert.deepEqual(
        await rateLimit.reserveAnalyzeUsageAndStartCase(tx as never, USER_ID, CASE_ID),
        { usageEventId: "usage-event-id", analyzeRunId: RUN_ID },
    );
    const lockSql = rawSql.find((sql) => sql.includes("pg_advisory_xact_lock"));
    assert.match(lockSql ?? "", /SELECT 1 AS locked/);
    assert.match(lockSql ?? "", /FROM pg_advisory_xact_lock/);
});

test("analyzing, analyzed, and another user's case do not start again", async (t) => {
    for (const [status, expected] of [
        ["analyzing", { kind: "analyzing" }],
        ["analyzed", { kind: "analyzed" }],
        [null, { kind: "not_found" }],
    ] as const) {
        const { tx, rawSql } = transactionForStatus(status);
        replaceMethod(t, prisma, "$transaction", async (callback) => callback(tx as never));
        assert.deepEqual(await repository.startAnalysis(USER_ID, CASE_ID), expected);
        assert.equal(rawSql.some((sql) => sql.includes("UPDATE analysis_cases")), false);
    }
});

test("successful analysis atomically sets analyzed, saves a result, and increments version", async (t) => {
    let sqlText = "";
    replaceMethod(t, prisma, "$transaction", async (callback) => callback({
        $queryRaw: async (query: { strings: readonly string[] }) => {
            sqlText = query.strings.join("");
            return [{
                id: "99999999-9999-4999-8999-999999999999",
                version: 3,
                created_at: new Date("2026-08-10T00:00:00.000Z"),
            }];
        },
    } as never));

    const result = await repository.completeAnalysis({
        userId: USER_ID,
        caseId: CASE_ID,
        analyzeRunId: RUN_ID,
        promptVersion: "v4",
        resultSchemaVersion: "v2",
        model: "test-model",
        result: { summary: { oneLine: "test" } } as never,
        context: { schemaVersion: "v4" } as never,
        usedCaseIds: [],
        usedFeedbackIds: [],
        personProfileId: null,
        userPatternSummaryId: null,
    });

    assert.equal(result?.version, 3);
    assert.match(sqlText, /SET\s+status = 'analyzed'/);
    assert.match(sqlText, /AND status = 'analyzing'/);
    assert.match(sqlText, /AND analyze_run_id =/);
    assert.match(sqlText, /COALESCE\(MAX\(ar.version\), 0\) \+ 1/);
    assert.match(sqlText, /INSERT INTO analysis_results/);
});

test("an old analyze_run_id cannot overwrite the current state or save a result", async (t) => {
    let sqlText = "";
    replaceMethod(t, prisma, "$transaction", async (callback) => callback({
        $queryRaw: async (query: { strings: readonly string[] }) => {
            sqlText = query.strings.join("");
            return [];
        },
    } as never));

    const result = await repository.completeAnalysis({
        userId: USER_ID,
        caseId: CASE_ID,
        analyzeRunId: RUN_ID,
        promptVersion: "v4",
        resultSchemaVersion: "v2",
        model: "test-model",
        result: { summary: { oneLine: "stale" } } as never,
        context: { schemaVersion: "v4" } as never,
        usedCaseIds: [],
        usedFeedbackIds: [],
        personProfileId: null,
        userPatternSummaryId: null,
    });

    assert.equal(result, null);
    assert.match(sqlText, /AND analyze_run_id =/);
    assert.match(sqlText, /FROM updated_case/);
});

test("failed analysis is scoped by userId, analyzing status, and current analyze_run_id", async (t) => {
    const updateMany = replaceMethod(
        t,
        prisma.analysisCase,
        "updateMany",
        async (_args: unknown) => ({ count: 1 }),
    );
    await repository.failAnalysis({
        userId: USER_ID,
        caseId: CASE_ID,
        analyzeRunId: RUN_ID,
        failureCode: "AI_PROVIDER_ERROR",
        failureMessage: "failed",
    });

    assert.deepEqual(updateMany.mock.calls[0]?.arguments[0], {
        where: {
            id: CASE_ID,
            userId: USER_ID,
            status: "analyzing",
            analyzeRunId: RUN_ID,
        },
        data: {
            status: "failed",
            failureCode: "AI_PROVIDER_ERROR",
            failureMessage: "failed",
        },
    });
});

test("latest AnalysisResult is selected by version DESC and user ownership", async (t) => {
    const findFirst = replaceMethod(
        t,
        prisma.analysisResult,
        "findFirst",
        async (_args: unknown) => null,
    );
    await repository.findLatestResult(USER_ID, CASE_ID);
    assert.deepEqual(findFirst.mock.calls[0]?.arguments[0], {
        where: { userId: USER_ID, analysisCaseId: CASE_ID },
        orderBy: { version: "desc" },
    });
});


test("stale detection requires analyzing status, a run ID, and a timestamp older than the caller cutoff", () => {
    const detect = (repository as unknown as { isStaleAnalysis?: (state: unknown, cutoff: Date) => boolean }).isStaleAnalysis;
    assert.equal(typeof detect, "function");
    const cutoff = new Date("2026-10-01T12:00:00Z");
    const stale = { status: "analyzing", analyzeRunId: RUN_ID, analyzeStartedAt: new Date("2026-10-01T11:59:59Z") };
    assert.equal(detect!(stale, cutoff), true);
    for (const state of [
        { ...stale, status: "failed" },
        { ...stale, analyzeRunId: null },
        { ...stale, analyzeStartedAt: null },
        { ...stale, analyzeStartedAt: cutoff },
        { ...stale, analyzeStartedAt: new Date("2026-10-01T12:00:01Z") },
    ]) assert.equal(detect!(state, cutoff), false);
    assert.throws(() => detect!(stale, new Date("invalid")), /cutoff/);
});

test("stale recovery changes only the matched owned run and records no consultation contents", async (t) => {
    const recover = (repository as unknown as { recoverStaleAnalysis?: (input: unknown) => Promise<{ count: number }> }).recoverStaleAnalysis;
    assert.equal(typeof recover, "function");
    const cutoff = new Date("2026-10-01T12:00:00Z");
    const where: unknown[] = [];
    const events: unknown[] = [];
    replaceMethod(t, console, "info", (...args: unknown[]) => { events.push(args); });
    replaceMethod(t, prisma, "$transaction", async (callback) => callback({
        $queryRaw: async () => [{ locked: 1 }],
        analysisCase: {
            findFirst: async (args: { where: unknown }) => {
                assert.deepEqual(args.where, { id: CASE_ID, userId: USER_ID });
                return { status: "analyzing", analyzeRunId: RUN_ID, analyzeStartedAt: new Date("2026-10-01T11:59:59Z") };
            },
            updateMany: async (args: { where: unknown; data: unknown }) => {
                where.push(args.where);
                assert.deepEqual(args.data, {
                    status: "failed", failureCode: "ANALYSIS_STALE",
                    failureMessage: "分析処理が途中で停止した可能性があります。",
                });
                return { count: 1 };
            },
        },
    }));
    assert.deepEqual(await recover!({ userId: USER_ID, caseId: CASE_ID, analyzeRunId: RUN_ID, cutoff }), { count: 1 });
    assert.deepEqual(where, [{
        id: CASE_ID, userId: USER_ID, status: "analyzing", analyzeRunId: RUN_ID,
        analyzeStartedAt: { lt: cutoff },
    }]);
    assert.deepEqual(events, [["analysis_stale_recovered", { caseId: CASE_ID, runId: RUN_ID, status: "failed" }]]);
});

test("recovery refuses a new run, a non-stale run, or another owner's missing case", async (t) => {
    const recover = (repository as unknown as { recoverStaleAnalysis?: (input: unknown) => Promise<{ count: number }> }).recoverStaleAnalysis;
    assert.equal(typeof recover, "function");
    const cutoff = new Date("2026-10-01T12:00:00Z");
    let writes = 0;
    for (const current of [
        null,
        { status: "analyzing", analyzeRunId: "99999999-9999-4999-8999-999999999999", analyzeStartedAt: new Date("2026-10-01T11:59:59Z") },
        { status: "analyzing", analyzeRunId: RUN_ID, analyzeStartedAt: cutoff },
    ]) {
        replaceMethod(t, prisma, "$transaction", async (callback) => callback({
            $queryRaw: async () => [{ locked: 1 }],
            analysisCase: { findFirst: async () => current, updateMany: async () => { writes += 1; return { count: 1 }; } },
        }));
        assert.deepEqual(await recover!({ userId: USER_ID, caseId: CASE_ID, analyzeRunId: RUN_ID, cutoff }), { count: 0 });
    }
    assert.equal(writes, 0);
});


test("recovery rejects invalid or future cutoffs before contacting the database", async (t) => {
    const transaction = replaceMethod(t, prisma, "$transaction", async () => { throw new Error("database must not be contacted"); });
    for (const cutoff of [new Date("invalid"), new Date(Date.now() + 60_000)]) {
        await assert.rejects(repository.recoverStaleAnalysis({ userId: USER_ID, caseId: CASE_ID, analyzeRunId: RUN_ID, cutoff }), /cutoff/);
    }
    assert.equal(transaction.mock.callCount(), 0);
});
