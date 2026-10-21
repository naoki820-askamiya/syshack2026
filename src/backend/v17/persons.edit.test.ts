import assert from "node:assert/strict";
import test, { after } from "node:test";
process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/kigen404_test";
const [{ prisma }, persons, workflow] = await Promise.all([
    import("../prisma/client.js"), import("./persons.repository.js"), import("./workflow.repository.js"),
]);
after(() => prisma.$disconnect());
const userId = "11111111-1111-4111-8111-111111111111";
const personId = "33333333-3333-4333-8333-333333333333";
function replace(t: test.TestContext, target: object, name: string, fn: (...args: any[]) => any) {
    const object = target as any; const original = object[name]; object[name] = fn;
    t.after(() => { object[name] = original; });
}

test("Person identity save invalidates the owned Profile in the same transaction even with privacy OFF", async t => {
    let transaction = false; let invalidations = 0;
    const person = { id: personId, displayName: "Current name", relationshipType: "friend" };
    const tx = { person: { updateMany: async ({ where }: any) => {
        assert.equal(transaction, true); assert.deepEqual(where, { id: personId, userId, archivedAt: null }); return { count: 1 };
    }, findFirst: async () => person }, personProfile: { updateMany: async ({ where, data }: any) => {
        assert.equal(transaction, true); assert.deepEqual(where, { userId, personId });
        assert.equal(data.needsRefresh, true); assert.ok(data.staleSince instanceof Date); invalidations++; return { count: 1 };
    } } };
    replace(t, prisma, "$transaction", async callback => { transaction = true; try { return await callback(tx); } finally { transaction = false; } });
    replace(t, prisma.person, "updateMany", tx.person.updateMany);
    replace(t, prisma.person, "findFirst", tx.person.findFirst);
    assert.deepEqual(await persons.updateOwnedPerson(userId, personId, { relationshipType: "friend" }), person);
    assert.equal(invalidations, 1);
});

test("wrong-owner or archived Person save never changes any Profile", async t => {
    let profiles = 0;
    const tx = { person: { updateMany: async () => ({ count: 0 }), findFirst: async () => { throw new Error("unexpected read"); } },
        personProfile: { updateMany: async () => { profiles++; return { count: 1 }; } } };
    replace(t, prisma, "$transaction", async callback => callback(tx));
    replace(t, prisma.person, "updateMany", tx.person.updateMany);
    assert.equal(await persons.updateOwnedPerson(userId, personId, { displayName: "Foreign" }), null);
    assert.equal(profiles, 0);
});

test("new Case snapshot comes from the locked active owned Person, never the supplied stale draft", async t => {
    let locked = false;
    const create = async ({ data }: any) => {
        assert.equal(locked, true);
        assert.deepEqual(data.personSnapshot.person, { displayName: "Edited name", relationshipType: "friend" });
        return { id: "case-id", ...data };
    };
    replace(t, prisma, "$transaction", async callback => callback({
        $queryRaw: async (sql: any) => { assert.match((sql.strings ?? sql).join(""), /FOR SHARE/); locked = true;
            return [{ displayName: "Edited name", relationshipType: "friend" }]; }, analysisCase: { create },
    }));
    replace(t, prisma.analysisCase, "create", create);
    await workflow.createCase(userId, { personId, eventFacts: "Synthetic", userAgeRange: "unknown", userGender: "unknown",
        perceivedPartnerReaction: "unknown", elapsedTimeType: "unknown", userResponseType: "none", userResponseText: null,
        personSnapshot: { person: { displayName: "Stale", relationshipType: "coworker" } } });
});
