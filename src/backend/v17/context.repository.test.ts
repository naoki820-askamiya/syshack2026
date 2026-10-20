import assert from "node:assert/strict";
import test, { after } from "node:test";
import { aiAnalysisInputSchema } from "../ai/v2/input.schema.js";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/kigen404_test";
const [{ prisma }, { buildAiContext }] = await Promise.all([
    import("../prisma/client.js"),
    import("./context.repository.js"),
]);
const USER_ID = "11111111-1111-4111-8111-111111111111";
const PERSON_ID = "33333333-3333-4333-8333-333333333333";
const CASE_ID = "55555555-5555-4555-8555-555555555555";
const FEEDBACK_ID = "88888888-8888-4888-8888-888888888888";

after(() => prisma.$disconnect());

function replace(t: test.TestContext, target: object, name: string, implementation: (...args: any[]) => any) {
    const methods = target as Record<string, unknown>;
    const original = methods[name];
    const mock = t.mock.fn(implementation);
    methods[name] = mock;
    t.after(() => { methods[name] = original; });
    return mock;
}

function mockContext(t: test.TestContext, personalizationEnabled: boolean, outcomeNote: string) {
    replace(t, prisma.analysisCase, "findFirst", async (args) => {
        assert.deepEqual(args.where, { id: CASE_ID, userId: USER_ID });
        return ({
        id: CASE_ID, personId: PERSON_ID,
        personSnapshot: { person: { displayName: "相手A", relationshipType: "coworker" } },
        userAgeRange: "20代", userGender: "回答しない",
        perceivedPartnerReaction: "冷たい", elapsedTimeType: "数時間後",
        eventFacts: "確認の連絡に短い返信があった。",
        userResponseType: "none", userResponseText: null,
    }); });
    replace(t, prisma.userPrivacySetting, "upsert", async () => ({
        personalizationEnabled, usePersonProfile: false, useFeedbackForContext: true,
    }));
    const cases = replace(t, prisma.analysisCase, "findMany", async () => []);
    const feedbacks = replace(t, prisma.analysisFeedback, "findMany", async (args) => {
        assert.equal(args.where.userId, USER_ID);
        assert.equal(args.where.allowPersonalizationUse, true);
        assert.deepEqual(args.where.analysisCase, { personId: PERSON_ID });
        return [{ id: FEEDBACK_ID, actualOutcome: "普通だった", overreadScore: 2, outcomeNote }];
    });
    return { cases, feedbacks };
}

for (const length of [500, 501, 1000]) {
    for (const enabled of [true, false]) {
        test("saved feedback " + length + " chars remains valid with personalization " + enabled, async (t) => {
            const note = "記".repeat(length);
            const mocks = mockContext(t, enabled, note);
            const context = await buildAiContext(USER_ID, CASE_ID);
            assert.ok(context);
            const parsed = aiAnalysisInputSchema.parse(context.aiInput);
            assert.deepEqual(parsed.referenceContext.recentFeedbacks.map((item) => item.outcomeNote), enabled ? [note] : []);
            assert.equal(mocks.feedbacks.mock.callCount(), enabled ? 1 : 0);
            assert.equal(mocks.cases.mock.callCount(), 0, "AI-generated history is not retrieved");
            assert.deepEqual(context.usedFeedbackIds, enabled ? [FEEDBACK_ID] : []);
        });
    }
}

test('H07/H08: privacy OFF and withdrawn Feedback never enter the next context or rewrite old snapshots', async t => {
    const oldSnapshot = { usedFeedbackIds: [FEEDBACK_ID], usedCaseIds: [CASE_ID] };
    const original = structuredClone(oldSnapshot);
    mockContext(t, false, 'withdrawn');
    const writes = replace(t, prisma.analysisResult, 'update', async () => { throw new Error('old snapshot must not be updated'); });
    let allowed = false;
    const feedback = replace(t, prisma.analysisFeedback, 'findMany', async args => {
        assert.equal(args.where.allowPersonalizationUse, true);
        return allowed ? [{ id: FEEDBACK_ID, actualOutcome: null, overreadScore: null, outcomeNote: 'permitted' }] : [];
    });
    const off = await buildAiContext(USER_ID, CASE_ID);
    assert.deepEqual(off?.usedFeedbackIds, []);
    assert.deepEqual(off?.usedCaseIds, []);
    assert.equal(off?.contextSnapshot.personalizationUsed, false);
    assert.equal(feedback.mock.callCount(), 0);
    replace(t, prisma.userPrivacySetting, 'upsert', async () => ({ personalizationEnabled: true, usePersonProfile: true, useFeedbackForContext: true }));
    allowed = true;
    assert.deepEqual((await buildAiContext(USER_ID, CASE_ID))?.usedFeedbackIds, [FEEDBACK_ID]);
    allowed = false;
    const withdrawn = await buildAiContext(USER_ID, CASE_ID);
    assert.deepEqual(withdrawn?.aiInput.referenceContext.recentFeedbacks, []);
    assert.equal(withdrawn?.personProfileId, null);
    assert.equal(writes.mock.callCount(), 0);
    assert.deepEqual(oldSnapshot, original);
});

test('H09: current case owner and Feedback owner/person are constrained before model input', async t => {
    mockContext(t, true, 'owned');
    const context = await buildAiContext(USER_ID, CASE_ID);
    assert.deepEqual(context?.usedFeedbackIds, [FEEDBACK_ID]); // mockContext asserts all query predicates.
    const privacy = replace(t, prisma.userPrivacySetting, 'upsert', async () => { throw new Error('no context for an unowned case'); });
    replace(t, prisma.analysisCase, 'findFirst', async args => {
        assert.deepEqual(args.where, { id: CASE_ID, userId: USER_ID });
        return null; // Scoped query returns no row for another owner.
    });
    assert.equal(await buildAiContext(USER_ID, CASE_ID), null);
    assert.equal(privacy.mock.callCount(), 0);
});


const PROFILE_ID = "99999999-9999-4999-8999-999999999999";
const RESULT_ID = "77777777-7777-4777-8777-777777777777";
const GENERATED_AT = new Date("2026-10-01T12:00:00Z");

function mockProfile(t: test.TestContext, overrides: Record<string, unknown> = {}) {
    mockContext(t, true, "観察後の振り返り");
    replace(t, prisma.userPrivacySetting, "upsert", async () => ({
        personalizationEnabled: true, usePersonProfile: true, useFeedbackForContext: false,
    }));
    replace(t, prisma.personProfile, "findFirst", async (args) => {
        assert.deepEqual(args.where, { userId: USER_ID, personId: PERSON_ID });
        return {
            id: PROFILE_ID, profileJson: { summary: "AIによる過去の解釈" },
            needsRefresh: false, staleSince: null, generatedAt: GENERATED_AT,
            generatedByModel: "synthetic-model", profileSchemaVersion: "synthetic-v1",
            sourceLatestCaseId: CASE_ID, sourceCaseCount: 1, sourceFeedbackCount: 0,
            ...overrides,
        };
    });
}

for (const [name, overrides] of [
    ["needs refresh", { needsRefresh: true }],
    ["stale", { staleSince: GENERATED_AT }],
    ["unknown model", { generatedByModel: null }],
    ["unknown source", { sourceLatestCaseId: null }],
    ["no source count", { sourceCaseCount: 0 }],
]) {
    test("Profile with " + name + " falls back to current input when other references are absent", async (t) => {
        mockProfile(t, overrides as Record<string, unknown>);
        const context = await buildAiContext(USER_ID, CASE_ID);
        assert.ok(context);
        assert.equal(context.aiInput.referenceContext.personProfile, null);
        assert.equal(context.personProfileId, null);
        assert.equal(context.contextSnapshot.personalizationUsed, false);
    });
}

test("even an eligible saved Profile is excluded without querying it", async (t) => {
    mockProfile(t);
    const profile = replace(t, prisma.personProfile, "findFirst", async () => { throw new Error("Profile must not be read"); });
    const history = replace(t, prisma.analysisCase, "findMany", async () => { throw new Error("AI summary must not be read"); });
    const context = await buildAiContext(USER_ID, CASE_ID);
    assert.ok(context);
    assert.equal(context.personProfileId, null);
    assert.equal(context.aiInput.referenceContext.personProfile, null);
    assert.equal(context.aiInput.referenceContext.provenance?.personProfile, null);
    assert.deepEqual(context.usedCaseIds, []);
    assert.equal(profile.mock.callCount(), 0);
    assert.equal(history.mock.callCount(), 0);
});

test("AI summaries are excluded while permitted user Feedback retains its provenance", async (t) => {
    mockContext(t, true, "翌日は普段どおりだった");
    replace(t, prisma.analysisCase, "findMany", async (args) => {
        assert.deepEqual(args.select.results.orderBy, { version: "desc" });
        return [{ id: CASE_ID, results: [{ id: RESULT_ID, createdAt: GENERATED_AT,
            resultJson: { summary: { oneLine: "忙しかった可能性があります。" } } }] }];
    });
    const context = await buildAiContext(USER_ID, CASE_ID);
    assert.ok(context);
    const reference = context.aiInput.referenceContext as unknown as {
        recentCaseSummaries: Array<{ provenance: Record<string, unknown> }>;
        recentFeedbacks: Array<{ provenance: Record<string, unknown> }>;
        provenance: { currentCase: Record<string, unknown>; personSnapshot: Record<string, unknown> };
    };
    assert.deepEqual(reference.recentCaseSummaries, []);
    assert.equal(reference.recentFeedbacks[0]?.provenance.kind, "user_feedback");
    assert.equal(reference.recentFeedbacks[0]?.provenance.sourceId, FEEDBACK_ID);
    assert.equal(reference.provenance.currentCase.kind, "user_provided_fact");
    assert.equal(reference.provenance.personSnapshot.kind, "user_provided_fact");
    aiAnalysisInputSchema.parse(context.aiInput);
});

for (const failure of ["missing", "wrong owner", "wrong person"]) {
    test("Profile with " + failure + " source case is excluded rather than treated as verified", async (t) => {
        mockProfile(t);
        const currentCase = await prisma.analysisCase.findFirst({ where: { id: CASE_ID, userId: USER_ID } });
        const lookup = replace(t, prisma.analysisCase, "findFirst", async (args) => {
            if (args.select) {
                assert.deepEqual(args.where, { id: CASE_ID, userId: USER_ID, personId: PERSON_ID });
                assert.deepEqual(args.select, { id: true });
                // A scoped DB query yields null for all three absence/ownership variants.
                return null;
            }
            return currentCase;
        });
        const context = await buildAiContext(USER_ID, CASE_ID);
        assert.ok(context);
        assert.equal(context.personProfileId, null);
        assert.equal(context.aiInput.referenceContext.personProfile, null);
        assert.equal(context.contextSnapshot.personalizationUsed, false);
        assert.equal(lookup.mock.callCount(), 1, "only the current owned case is read");
    });
}
