import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import test, { after, before } from "node:test";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/kigen404_test";
process.env.SUPABASE_URL ??= "https://test.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY ??= "test-publishable-key";

const [{ createServerApp }, { supabaseAuth }, { prisma }] = await Promise.all([
    import("../server.js"),
    import("../auth/supabase.js"),
    import("../prisma/client.js"),
]);

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const PERSON_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_PERSON_ID = "44444444-4444-4444-8444-444444444444";
const CASE_ID = "55555555-5555-4555-8555-555555555555";
const OTHER_CASE_ID = "66666666-6666-4666-8666-666666666666";
const RESULT_ID = "77777777-7777-4777-8777-777777777777";

let server: Server;
let baseUrl: string;

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

before(async () => {
    const app = await createServerApp();
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve, reject) => {
        server.once("listening", resolve);
        server.once("error", reject);
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
    await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
    });
    await prisma.$disconnect();
});

function authenticateAs(t: test.TestContext, userId = USER_ID) {
    replaceMethod(t, supabaseAuth.auth, "getUser", async () => ({
        data: { user: { id: userId, email: "user@example.com" } },
        error: null,
    }) as never);
}

function mockPersonTransaction(t: test.TestContext) {
    replaceMethod(t, prisma.personProfile, "updateMany", async () => ({ count: 0 }));
    replaceMethod(t, prisma, "$transaction", async (operation) => {
        if (typeof operation !== "function") return Promise.all(operation);
        return operation({ person: prisma.person, personProfile: prisma.personProfile, analysisCase: prisma.analysisCase,
            $queryRaw: async (sql: TemplateStringsArray, personId: string, userId: string) => {
                assert.match(sql.join(""), /FOR SHARE/);
                const owned = await prisma.person.findFirst({ where: { id: personId, userId, archivedAt: null } });
                return owned ? [owned] : [];
            } });
    });
}

async function request(
    path: string,
    init: RequestInit = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
    const response = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: {
            ...(init.body ? { "content-type": "application/json" } : {}),
            ...init.headers,
        },
    });
    return {
        status: response.status,
        body: await response.json() as Record<string, unknown>,
    };
}

function authorizedJson(method: string, body?: unknown): RequestInit {
    return {
        method,
        headers: { authorization: "Bearer valid-test-token" },
        body: body === undefined ? undefined : JSON.stringify(body),
    };
}

function person(overrides: Record<string, unknown> = {}) {
    return {
        id: PERSON_ID,
        userId: USER_ID,
        displayName: "同僚A",
        relationshipType: "coworker",
        notes: null,
        archivedAt: null,
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
        updatedAt: new Date("2026-08-02T00:00:00.000Z"),
        ...overrides,
    };
}

function caseBody(personId = PERSON_ID) {
    return {
        personId,
        userAgeRange: "20代",
        userGender: "回答しない",
        perceivedPartnerReaction: "冷たい",
        elapsedTimeType: "数時間後",
        eventFacts: "確認の連絡に短い返信があった。",
        userResponseType: "none",
        userResponseText: null,
    };
}

test("protected APIs return 401 without a valid authenticated session", async (t) => {
    const missing = await request("/api/persons");
    assert.equal(missing.status, 401);
    assert.equal((missing.body.error as { code: string }).code, "UNAUTHENTICATED");

    replaceMethod(t, supabaseAuth.auth, "getUser", async () => ({
        data: { user: null },
        error: new Error("invalid token"),
    }) as never);
    const invalid = await request("/api/analysis-cases", {
        headers: { authorization: "Bearer invalid-test-token" },
    });
    assert.equal(invalid.status, 401);
    assert.equal((invalid.body.error as { code: string }).code, "UNAUTHENTICATED");
});

test("Person create uses authenticated userId and rejects client user_id", async (t) => {
    authenticateAs(t);
    const create = replaceMethod(t, prisma.person, "create", async (args) => ({
        ...person(),
        ...args.data,
    }) as never);

    const created = await request("/api/persons", authorizedJson("POST", {
        displayName: "同僚A",
        relationshipType: "coworker",
    }));
    assert.equal(created.status, 201);
    assert.equal(create.mock.callCount(), 1);
    assert.deepEqual(create.mock.calls[0]?.arguments[0]?.data, {
        userId: USER_ID,
        displayName: "同僚A",
        relationshipType: "coworker",
        notes: null,
    });

    const spoofed = await request("/api/persons", authorizedJson("POST", {
        displayName: "同僚B",
        relationshipType: "friend",
        user_id: OTHER_USER_ID,
    }));
    assert.equal(spoofed.status, 400);
    assert.equal(create.mock.callCount(), 1);
});

test("Person list, detail, and update are scoped to authenticated userId", async (t) => {
    authenticateAs(t);
    const findMany = replaceMethod(t, prisma.person, "findMany", async (args) => {
        assert.deepEqual(args.where, { userId: USER_ID, archivedAt: null });
        return [person()] as never;
    });
    const count = replaceMethod(t, prisma.person, "count", async (args) => {
        assert.deepEqual(args.where, { userId: USER_ID, archivedAt: null });
        return 1;
    });
    mockPersonTransaction(t);

    const listed = await request("/api/persons?limit=10&offset=0", authorizedJson("GET"));
    assert.equal(listed.status, 200);
    assert.equal(findMany.mock.callCount(), 1);
    assert.equal(count.mock.callCount(), 1);
    assert.equal((listed.body.persons as unknown[]).length, 1);

    const findFirst = replaceMethod(t, prisma.person, "findFirst", async (args) => {
        assert.equal(args.where.userId, USER_ID);
        return args.where.id === PERSON_ID ? person() as never : null;
    });
    const detail = await request(`/api/persons/${PERSON_ID}`, authorizedJson("GET"));
    assert.equal(detail.status, 200);
    assert.equal((detail.body.person as { id: string }).id, PERSON_ID);

    const updateMany = replaceMethod(t, prisma.person, "updateMany", async (args) => {
        assert.deepEqual(args.where, { id: PERSON_ID, userId: USER_ID, archivedAt: null });
        assert.deepEqual(args.data, {
            displayName: "更新後",
            relationshipType: undefined,
        });
        return { count: 1 };
    });
    const updated = await request(`/api/persons/${PERSON_ID}`, authorizedJson("PATCH", {
        displayName: "更新後",
    }));
    assert.equal(updated.status, 200);
    assert.equal(updateMany.mock.callCount(), 1);
    assert.equal(findFirst.mock.callCount(), 2);
});

test("another user's Person cannot be read or updated", async (t) => {
    authenticateAs(t);
    mockPersonTransaction(t);
    const findFirst = replaceMethod(t, prisma.person, "findFirst", async (args) => {
        assert.equal(args.where.userId, USER_ID);
        return null;
    });
    const updateMany = replaceMethod(t, prisma.person, "updateMany", async (args) => {
        assert.equal(args.where.userId, USER_ID);
        return { count: 0 };
    });

    const detail = await request(`/api/persons/${OTHER_PERSON_ID}`, authorizedJson("GET"));
    assert.equal(detail.status, 404);
    const updated = await request(`/api/persons/${OTHER_PERSON_ID}`, authorizedJson("PATCH", {
        displayName: "不正な更新",
    }));
    assert.equal(updated.status, 404);
    assert.equal(findFirst.mock.callCount(), 1);
    assert.equal(updateMany.mock.callCount(), 1);
});

test("AnalysisCase create saves authenticated userId and Person snapshot", async (t) => {
    authenticateAs(t);
    mockPersonTransaction(t);
    replaceMethod(t, prisma.person, "findFirst", async (args) => {
        assert.deepEqual(args.where, { id: PERSON_ID, userId: USER_ID, archivedAt: null });
        return person() as never;
    });
    const create = replaceMethod(t, prisma.analysisCase, "create", async (args) => ({
        id: CASE_ID,
        status: "draft",
        ...args.data,
    }) as never);

    const response = await request("/api/analysis-cases", authorizedJson("POST", caseBody()));
    assert.equal(response.status, 201);
    const data = create.mock.calls[0]?.arguments[0]?.data;
    assert.equal(data?.userId, USER_ID);
    assert.equal(data?.personId, PERSON_ID);
    assert.deepEqual((data?.personSnapshot as { person: unknown }).person, {
        displayName: "同僚A",
        relationshipType: "coworker",
    });
    assert.match((data?.personSnapshot as { capturedAt: string }).capturedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("AnalysisCase create rejects another user's Person and client user_id", async (t) => {
    authenticateAs(t);
    mockPersonTransaction(t);
    replaceMethod(t, prisma.person, "findFirst", async (args) => {
        assert.equal(args.where.userId, USER_ID);
        return null;
    });
    const create = replaceMethod(t, prisma.analysisCase, "create", async () => {
        throw new Error("must not create");
    });

    const otherPerson = await request("/api/analysis-cases", authorizedJson("POST", caseBody(OTHER_PERSON_ID)));
    assert.equal(otherPerson.status, 404);

    const spoofed = await request("/api/analysis-cases", authorizedJson("POST", {
        ...caseBody(),
        user_id: OTHER_USER_ID,
    }));
    assert.equal(spoofed.status, 400);
    assert.equal(create.mock.callCount(), 0);
});

test("AnalysisCase and latest AnalysisResult reads enforce ownership and version ordering", async (t) => {
    authenticateAs(t);
    const findCase = replaceMethod(t, prisma.analysisCase, "findFirst", async (args) => {
        assert.equal(args.where.userId, USER_ID);
        if (args.where.id === OTHER_CASE_ID) return null;
        return { id: CASE_ID, userId: USER_ID, status: "analyzed" } as never;
    });
    const findResult = replaceMethod(t, prisma.analysisResult, "findFirst", async (args) => {
        assert.deepEqual(args.where, { userId: USER_ID, analysisCaseId: CASE_ID });
        assert.deepEqual(args.orderBy, { version: "desc" });
        return {
            id: RESULT_ID,
            analysisCaseId: CASE_ID,
            version: 3,
            promptVersion: "v4",
            resultSchemaVersion: "v2",
            model: "test-model",
            createdAt: new Date("2026-08-10T00:00:00.000Z"),
            resultJson: { summary: { oneLine: "test" } },
        } as never;
    });

    const detail = await request(`/api/analysis-cases/${CASE_ID}`, authorizedJson("GET"));
    assert.equal(detail.status, 200);
    const latest = await request(`/api/analysis-cases/${CASE_ID}/results/latest`, authorizedJson("GET"));
    assert.equal(latest.status, 200);
    assert.equal((latest.body.result as { version: number }).version, 3);

    const otherCase = await request(`/api/analysis-cases/${OTHER_CASE_ID}`, authorizedJson("GET"));
    assert.equal(otherCase.status, 404);
    const otherResult = await request(`/api/analysis-cases/${OTHER_CASE_ID}/results/latest`, authorizedJson("GET"));
    assert.equal(otherResult.status, 404);
    assert.equal(findResult.mock.callCount(), 1);
    assert.equal(findCase.mock.callCount(), 4);
});

test("analyzing and analyzed cases cannot be re-run, and another user's case is hidden", async (t) => {
    authenticateAs(t);
    for (const [status, code, expectedStatus] of [
        ["analyzing", "CASE_ALREADY_ANALYZING", 409],
        ["analyzed", "CASE_ALREADY_ANALYZED", 409],
        [null, "RESOURCE_NOT_FOUND", 404],
    ] as const) {
        replaceMethod(t, prisma, "$transaction", async (callback) => callback({
            $queryRaw: async () => [],
            analysisCase: {
                findFirst: async (args: { where: unknown; select: unknown }) => {
                    assert.deepEqual(args.where, { id: CASE_ID, userId: USER_ID });
                    assert.deepEqual(args.select, { status: true });
                    return status ? { status } : null;
                },
            },
        } as never));

        const response = await request(
            `/api/analysis-cases/${CASE_ID}/analyze`,
            authorizedJson("POST"),
        );
        assert.equal(response.status, expectedStatus);
        assert.equal((response.body.error as { code: string }).code, code);
    }
});

test("another user's resultId returns 404", async (t) => {
    authenticateAs(t);
    const findResult = replaceMethod(t, prisma.analysisResult, "findFirst", async (args) => {
        assert.deepEqual(args.where, { id: RESULT_ID, userId: USER_ID });
        return null;
    });
    const feedback = await request(`/api/analysis-results/${RESULT_ID}/feedback`, authorizedJson("GET"));
    assert.equal(feedback.status, 404);
    assert.equal(findResult.mock.callCount(), 1);
});

test("Feedback API preserves the 500, 501, and 1000 character contract", async (t) => {
    authenticateAs(t);
    replaceMethod(t, prisma.analysisResult, "findFirst", async () => ({
        id: RESULT_ID, analysisCaseId: CASE_ID, analysisCase: { personId: PERSON_ID },
    }));
    replaceMethod(t, prisma.userPrivacySetting, "findUnique", async () => null);
    const create = replaceMethod(t, prisma.analysisFeedback, "create", async (args) => ({
        id: "88888888-8888-4888-8888-888888888888", allowPersonalizationUse: false, ...args.data,
    }));
    replaceMethod(t, prisma, "$transaction", async (callback) => callback({
        analysisFeedback: { create },
    }));
    for (const length of [500, 501, 1000]) {
        const outcomeNote = "記".repeat(length);
        const response = await request("/api/analysis-results/" + RESULT_ID + "/feedback", authorizedJson("POST", {
            outcomeNote, allowPersonalizationUse: false,
        }));
        assert.equal(response.status, 201);
        assert.equal((response.body.feedback as { outcomeNote: string }).outcomeNote, outcomeNote);
    }
    const tooLong = await request("/api/analysis-results/" + RESULT_ID + "/feedback", authorizedJson("POST", {
        outcomeNote: "記".repeat(1001),
    }));
    assert.equal(tooLong.status, 400);
    assert.equal(create.mock.callCount(), 3);
});


function mockFeedbackStorage(t: test.TestContext, initialFeedback: Record<string, unknown> | null = null, privacyEnabled = true) {
    let stored = initialFeedback ? { ...initialFeedback } : null;
    let auxiliaryFails = true;
    let staleWrites = 0;
    const create = async (args: { data: Record<string, unknown> }) => {
        if (stored) throw Object.assign(new Error("unique feedback"), { code: "P2002" });
        stored = { id: "88888888-8888-4888-8888-888888888888", allowPersonalizationUse: true, ...args.data };
        return { ...stored };
    };
    const update = async (args: { data: Record<string, unknown> }) => {
        stored = { ...stored, ...args.data };
        return { ...stored };
    };
    const privacy = async () => ({ personalizationEnabled: privacyEnabled, useFeedbackForContext: privacyEnabled });
    const invalidate = async (_sql: TemplateStringsArray, userId: string, personId: string) => {
        assert.equal(userId, USER_ID);
        assert.equal(personId, PERSON_ID);
        staleWrites += 1;
        if (auxiliaryFails) throw new Error("private internal failure");
        return 1;
    };
    replaceMethod(t, prisma.analysisResult, "findFirst", async () => ({
        id: RESULT_ID, analysisCaseId: CASE_ID, analysisCase: { personId: PERSON_ID },
    }));
    replaceMethod(t, prisma.analysisFeedback, "findFirst", async () => stored ? {
        ...stored, analysisCase: { personId: PERSON_ID },
    } : null);
    replaceMethod(t, prisma.analysisFeedback, "create", create);
    replaceMethod(t, prisma.analysisFeedback, "update", update);
    replaceMethod(t, prisma.userPrivacySetting, "findUnique", privacy);
    replaceMethod(t, prisma, "$executeRaw", invalidate);
    const transaction = replaceMethod(t, prisma, "$transaction", async (callback) => {
        const before = stored ? { ...stored } : null;
        try {
            return await callback({
                analysisFeedback: { create, update },
                userPrivacySetting: { findUnique: privacy },
                $executeRaw: invalidate,
            });
        } catch (error) {
            stored = before;
            throw error;
        }
    });
    return {
        get stored() { return stored; },
        get staleWrites() { return staleWrites; },
        transaction,
        allowAuxiliarySuccess() { auxiliaryFails = false; },
    };
}

test("Feedback POST auxiliary failure rolls back so a retry can create feedback", async (t) => {
    authenticateAs(t);
    const storage = mockFeedbackStorage(t);
    const path = "/api/analysis-results/" + RESULT_ID + "/feedback";
    const body = { outcomeNote: "翌日は通常どおりでした。", allowPersonalizationUse: true };
    const failed = await request(path, authorizedJson("POST", body));
    assert.equal(failed.status, 500);
    assert.equal(storage.stored, null);
    assert.equal(JSON.stringify(failed.body).includes("private internal failure"), false);
    storage.allowAuxiliarySuccess();
    const retried = await request(path, authorizedJson("POST", body));
    assert.equal(retried.status, 201);
    const savedAfterRetry = storage.stored as Record<string, unknown> | null;
    assert.equal(savedAfterRetry?.outcomeNote, body.outcomeNote);
    assert.equal(storage.transaction.mock.callCount(), 2);
    const duplicate = await request(path, authorizedJson("POST", body));
    assert.equal(duplicate.status, 409);
    assert.equal((duplicate.body.error as { code: string }).code, "FEEDBACK_ALREADY_EXISTS");
});

test("Feedback PATCH auxiliary failure preserves old values and consent", async (t) => {
    authenticateAs(t);
    const feedbackId = "88888888-8888-4888-8888-888888888888";
    const storage = mockFeedbackStorage(t, { id: feedbackId, outcomeNote: "以前の記録", allowPersonalizationUse: true });
    const path = "/api/analysis-feedbacks/" + feedbackId;
    const failed = await request(path, authorizedJson("PATCH", { outcomeNote: "訂正した記録" }));
    assert.equal(failed.status, 500);
    assert.equal(storage.stored?.outcomeNote, "以前の記録");
    storage.allowAuxiliarySuccess();
    const retried = await request(path, authorizedJson("PATCH", { outcomeNote: "訂正した記録", allowPersonalizationUse: false }));
    assert.equal(retried.status, 200);
    assert.equal(storage.stored?.outcomeNote, "訂正した記録");
    assert.equal(storage.stored?.allowPersonalizationUse, false);
    assert.equal(storage.staleWrites, 2);
    assert.equal(storage.transaction.mock.callCount(), 2);
});



test("withdrawing previously allowed Feedback invalidates its Profile even when privacy is OFF", async (t) => {
    authenticateAs(t);
    const feedbackId = "88888888-8888-4888-8888-888888888888";
    const storage = mockFeedbackStorage(t, { id: feedbackId, outcomeNote: "以前の記録", allowPersonalizationUse: true }, false);
    storage.allowAuxiliarySuccess();
    const response = await request("/api/analysis-feedbacks/" + feedbackId, authorizedJson("PATCH", { allowPersonalizationUse: false }));
    assert.equal(response.status, 200);
    assert.equal(storage.stored?.allowPersonalizationUse, false);
    assert.equal(storage.staleWrites, 1);
});
