import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/kigen404_test";
const { reserveAnalyzeUsageAndStartCase, settleUsage } = await import("./rateLimit.js");
const identity = { userId: "11111111-1111-4111-8111-111111111111", usageEventId: "usage-id",
    analysisCaseId: "55555555-5555-4555-8555-555555555555", analyzeRunId: "88888888-8888-4888-8888-888888888888" };
const settle = settleUsage as unknown as (client: unknown, correlation: typeof identity, status: "succeeded" | "failed", attempts: number) => Promise<unknown>;

test("reservation records the database-generated run and case in the same transaction", async () => {
    let started = false;
    const tx = {
        rateLimitPolicy: { findMany: async () => [] },
        $queryRaw: async () => { started = true; return [{ analyze_run_id: identity.analyzeRunId }]; },
        apiUsageEvent: { create: async ({ data }: any) => {
            assert.equal(started, true);
            assert.equal(data.userId, identity.userId);
            assert.equal(data.analysisCaseId, identity.analysisCaseId);
            assert.equal(data.analyzeRunId, identity.analyzeRunId);
            return { id: identity.usageEventId };
        } },
    };
    assert.deepEqual(await reserveAnalyzeUsageAndStartCase(tx as never, identity.userId, identity.analysisCaseId),
        { usageEventId: identity.usageEventId, analyzeRunId: identity.analyzeRunId });
});

test("settlement checks owner, event, original case/run and route rather than the current case run", async () => {
    const client = { apiUsageEvent: { updateMany: async (args: any) => {
        assert.deepEqual(args.where, { id: identity.usageEventId, userId: identity.userId,
            analysisCaseId: identity.analysisCaseId, analyzeRunId: identity.analyzeRunId, routeKey: "analyze", status: "allowed" });
        assert.deepEqual(args.data, { status: "failed", costUnits: 2 });
        return { count: 1 };
    } } };
    assert.equal(await settle(client, identity, "failed", 2), "settled");
});

for (const [row, outcome] of [[null, "unmatched"], [{ status: "failed", costUnits: 2 }, "already_settled"],
    [{ status: "succeeded", costUnits: 2 }, "conflict"], [{ status: "failed", costUnits: 1 }, "conflict"]] as const) {
    test(`zero-row settlement is classified as ${outcome} using the same owned linkage`, async () => {
        const client = { apiUsageEvent: { updateMany: async () => ({ count: 0 }), findFirst: async ({ where }: any) => {
            assert.deepEqual(where, { id: identity.usageEventId, userId: identity.userId,
                analysisCaseId: identity.analysisCaseId, analyzeRunId: identity.analyzeRunId, routeKey: "analyze" });
            return row;
        } } };
        assert.equal(await settle(client, identity, "failed", 2), outcome);
    });
}

for (const attempts of [NaN, Infinity, -1, 0.5, 4, null]) {
    test(`invalid/unknown attempts ${attempts} do not lower a reservation`, async () => {
        let calls = 0;
        await assert.rejects(settle({ apiUsageEvent: { updateMany: async () => { calls++; return { count: 1 }; } } },
            identity, "failed", attempts as number), RangeError);
        assert.equal(calls, 0);
    });
}
