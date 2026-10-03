import assert from "node:assert/strict";
import test, { after } from "node:test";
import { makeValidV2Result } from "../ai/v2/testFixture.js";
import { AnalyzeMoodV2Error } from "../ai/v2/analyzeMood.js";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/kigen404_test";
const [{ prisma }, { analyzeCase }] = await Promise.all([
    import("../prisma/client.js"), import("./workflow.service.js"),
]);
const USER_ID = "11111111-1111-4111-8111-111111111111";
const CASE_ID = "55555555-5555-4555-8555-555555555555";
const RUN_ID = "88888888-8888-4888-8888-888888888888";
const SECRET = "SYNTHETIC_PRIVATE_CONSULTATION_DO_NOT_LOG";
after(() => prisma.$disconnect());

function replace(t: test.TestContext, target: object, key: string, implementation: (...args: any[]) => any) {
    const methods = target as Record<string, unknown>;
    const original = methods[key];
    const mock = t.mock.fn(implementation);
    methods[key] = mock;
    t.after(() => { methods[key] = original; });
    return mock;
}

function startFixture(t: test.TestContext) {
    const tx = {
        $queryRaw: async (sql: TemplateStringsArray | { strings: readonly string[] }) => {
            const source = "strings" in sql ? sql.strings.join("") : Array.from(sql).join("");
            if (source.includes("INSERT INTO analysis_results")) return [{ id: "77777777-7777-4777-8777-777777777777", version: 1, created_at: new Date("2026-10-01T12:00:00Z") }];
            return source.includes("UPDATE analysis_cases") ? [{ analyze_run_id: RUN_ID }] : [{ locked: 1 }];
        },
        analysisCase: { findFirst: async () => ({ status: "draft" }) },
        rateLimitPolicy: { findMany: async () => [] },
        apiUsageEvent: { create: async () => ({ id: "usage-event-id" }) },
    };
    replace(t, prisma, "$transaction", async (callback) => callback(tx));
    const recovery = replace(t, prisma.analysisCase, "updateMany", async () => ({ count: 1 }));
    const settlement = replace(t, prisma.apiUsageEvent, "updateMany", async () => ({ count: 1 }));
    const events: Array<[string, Record<string, unknown>]> = [];
    replace(t, console, "info", (name: string, data: Record<string, unknown>) => { events.push([name, data]); });
    replace(t, console, "error", (name: string, data: Record<string, unknown>) => { events.push([name, data]); });
    return { events, recovery, settlement };
}

test("context failure is timed with IDs and stage without logging the consultation or error message", async (t) => {
    const { events, recovery, settlement } = startFixture(t);
    replace(t, prisma.analysisCase, "findFirst", async () => { throw new Error(SECRET); });
    const run = analyzeCase as unknown as (userId: string, caseId: string, options?: unknown) => ReturnType<typeof analyzeCase>;
    await assert.rejects(run(USER_ID, CASE_ID, { requestId: "req_44444444-4444-4444-8444-444444444444" }));
    const timing = events.find(([name]) => name === "analysis_timing")?.[1];
    assert.ok(timing);
    assert.equal(timing.requestId, "req_44444444-4444-4444-8444-444444444444");
    assert.equal(timing.runId, RUN_ID);
    assert.equal(timing.status, "failed");
    assert.equal(timing.errorStage, "db_context");
    assert.equal(timing.attempt, 0);
    const duration = timing.duration as Record<string, number | null>;
    assert.ok(duration.db_start_ms! >= 0 && duration.db_context_ms! >= 0 && duration.total_analysis_ms! >= 0);
    assert.equal(duration.provider_first_event_ms, null);
    assert.equal(duration.ai_generation_ms, null);
    assert.equal(JSON.stringify(events).includes(SECRET), false);
    assert.equal(recovery.mock.callCount(), 1);
    assert.equal(settlement.mock.callCount(), 1);
});

test("failed state compensation is observable while usage settlement still runs independently", async (t) => {
    const { events, settlement } = startFixture(t);
    replace(t, prisma.analysisCase, "findFirst", async () => { throw new Error(SECRET); });
    replace(t, prisma.analysisCase, "updateMany", async () => { throw new Error(SECRET); });
    await assert.rejects(analyzeCase(USER_ID, CASE_ID));
    const compensation = events.find(([name]) => name === "analysis_compensation_required")?.[1];
    assert.ok(compensation);
    assert.equal(compensation.caseId, CASE_ID);
    assert.equal(compensation.runId, RUN_ID);
    assert.equal(compensation.errorStage, "state_compensation");
    assert.equal(compensation.errorName, "Error");
    assert.equal(settlement.mock.callCount(), 1);
    assert.equal(JSON.stringify(events).includes(SECRET), false);
});

function contextFixture(t: test.TestContext) {
    replace(t, prisma.analysisCase, "findFirst", async () => ({
        id: CASE_ID, personId: "33333333-3333-4333-8333-333333333333",
        personSnapshot: { person: { displayName: SECRET, relationshipType: "coworker" } },
        userAgeRange: "20代", userGender: "回答しない", perceivedPartnerReaction: "冷たい",
        elapsedTimeType: "数時間後", eventFacts: SECRET, userResponseType: "none", userResponseText: null,
    }));
    replace(t, prisma.userPrivacySetting, "upsert", async () => ({ personalizationEnabled: false }));
}

const generateSuccess: NonNullable<Parameters<typeof analyzeCase>[2]>["generate"] = async (input) => {
    assert.equal(input.untrustedUserInput.currentCase.eventFacts, SECRET);
    const analysis = makeValidV2Result();
    analysis.summary.oneLine = SECRET;
    return { analysis, model: "synthetic-model", attempts: 2 };
};

test("successful generation measures stages, preserves the result, and never emits generated or input text", async (t) => {
    const { events, recovery, settlement } = startFixture(t);
    contextFixture(t);
    const result = await analyzeCase(USER_ID, CASE_ID, { requestId: SECRET, generate: generateSuccess });
    assert.equal(result.status, "analyzed");
    assert.equal(result.result.analysis.summary.oneLine, SECRET);
    assert.equal(recovery.mock.callCount(), 0);
    assert.equal(settlement.mock.callCount(), 1);
    assert.equal(settlement.mock.calls[0].arguments[0].data.costUnits, 2);
    const timing = events.find(([name]) => name === "analysis_timing")?.[1];
    assert.ok(timing);
    assert.equal(timing.status, "succeeded");
    assert.equal(timing.errorStage, null);
    assert.equal(timing.requestId, null);
    assert.equal(timing.model, "synthetic-model");
    assert.equal(timing.attempt, 2);
    assert.deepEqual(timing.counts, { recentCases: 0, feedbacks: 0, personProfiles: 0 });
    const duration = timing.duration as Record<string, number | null>;
    for (const key of ["db_start_ms", "db_context_ms", "ai_generation_ms", "db_save_ms", "total_analysis_ms"]) {
        assert.ok(Number.isFinite(duration[key]) && duration[key]! >= 0);
    }
    for (const key of ["provider_first_event_ms", "provider_complete_ms", "prompt_build_ms", "validation_ms"]) {
        assert.equal(duration[key], null);
    }
    assert.equal(JSON.stringify(events).includes(SECRET), false);
});

test("provider failure reports generation stage and reconciles actual attempts without error detail", async (t) => {
    const { events, settlement } = startFixture(t);
    contextFixture(t);
    await assert.rejects(analyzeCase(USER_ID, CASE_ID, {
        generate: async () => { throw new AnalyzeMoodV2Error("AI_PROVIDER_ERROR", SECRET, 2, new Error(SECRET)); },
    }), error => (error as { code: string }).code === "AI_PROVIDER_ERROR");
    const timing = events.find(([name]) => name === "analysis_timing")?.[1];
    assert.ok(timing);
    assert.equal(timing.errorStage, "ai_generation");
    assert.equal(timing.attempt, 2);
    assert.equal(timing.failureCode, "AI_PROVIDER_ERROR");
    assert.equal((timing.duration as Record<string, unknown>).db_save_ms, null);
    assert.equal(settlement.mock.calls[0].arguments[0].data.costUnits, 2);
    assert.equal(JSON.stringify(events).includes(SECRET), false);
});

test("logging and usage reconciliation failures cannot change a saved successful result", async (t) => {
    const { recovery } = startFixture(t);
    contextFixture(t);
    replace(t, console, "info", () => { throw new Error(SECRET); });
    replace(t, console, "error", () => { throw new Error(SECRET); });
    replace(t, prisma.apiUsageEvent, "updateMany", async () => { throw new Error(SECRET); });
    const result = await analyzeCase(USER_ID, CASE_ID, { generate: generateSuccess });
    assert.equal(result.status, "analyzed");
    assert.equal(recovery.mock.callCount(), 0);
});
