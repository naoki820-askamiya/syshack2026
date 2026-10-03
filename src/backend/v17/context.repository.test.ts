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
    replace(t, prisma.analysisCase, "findFirst", async () => ({
        id: CASE_ID, personId: PERSON_ID,
        personSnapshot: { person: { displayName: "相手A", relationshipType: "coworker" } },
        userAgeRange: "20代", userGender: "回答しない",
        perceivedPartnerReaction: "冷たい", elapsedTimeType: "数時間後",
        eventFacts: "確認の連絡に短い返信があった。",
        userResponseType: "none", userResponseText: null,
    }));
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
            assert.equal(mocks.cases.mock.callCount(), enabled ? 1 : 0);
            assert.deepEqual(context.usedFeedbackIds, enabled ? [FEEDBACK_ID] : []);
        });
    }
}

