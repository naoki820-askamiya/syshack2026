import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/kigen404_test";

const [{ prisma }, repository] = await Promise.all([
    import("../prisma/client.js"),
    import("./workflow.repository.js"),
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
        const startSql = rawSql.find((sql) => sql.includes("UPDATE analysis_cases"));
        assert.match(startSql ?? "", /status = 'analyzing'/);
        assert.match(startSql ?? "", /analyze_run_id = gen_random_uuid\(\)/);
        assert.match(startSql ?? "", /status IN \('draft', 'failed'\)/);
    }
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
