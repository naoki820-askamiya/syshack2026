import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import test, { after, before } from "node:test";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/kigen404_test";
process.env.SUPABASE_URL ??= "https://test.supabase.co";
process.env.SUPABASE_PUBLISHABLE_KEY ??= "test-publishable-key";
const [{ createServerApp }, { prisma }] = await Promise.all([
    import("../server.js"), import("../prisma/client.js"),
]);
let server: Server;
let baseUrl: string;
before(async () => {
    const app = await createServerApp();
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve, reject) => {
        server.once("listening", resolve);
        server.once("error", reject);
    });
    baseUrl = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
});
after(async () => {
    await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
    });
    await prisma.$disconnect();
});

for (const fixture of [
    { name: "malformed", body: '{"consultation":"private-marker"', status: 400, code: "INVALID_JSON" },
    { name: "oversized", body: JSON.stringify({ consultation: "private-marker" + "x".repeat(103_000) }), status: 413, code: "PAYLOAD_TOO_LARGE" },
]) {
    test(fixture.name + " JSON has a safe status and matching request ID", async () => {
        const response = await fetch(baseUrl + "/api/persons", {
            method: "POST", headers: { "content-type": "application/json", "x-request-id": "req-json-" + fixture.name },
            body: fixture.body,
        });
        const body = await response.json() as { error: { code: string; status: number; requestId: string } };
        assert.equal(response.status, fixture.status);
        assert.equal(body.error.status, fixture.status);
        assert.equal(body.error.code, fixture.code);
        assert.equal(response.headers.get("x-request-id"), "req-json-" + fixture.name);
        assert.equal(body.error.requestId, response.headers.get("x-request-id"));
        assert.equal(JSON.stringify(body).includes("private-marker"), false);
        assert.equal(JSON.stringify(body).includes("SyntaxError"), false);
    });
}

test("parser errors receive a generated request ID without a client header", async () => {
    const response = await fetch(baseUrl + "/api/persons", {
        method: "POST", headers: { "content-type": "application/json" }, body: "{",
    });
    const body = await response.json() as { error: { requestId: string } };
    assert.equal(response.status, 400);
    assert.match(body.error.requestId, /^req_[0-9a-f-]+$/);
    assert.equal(body.error.requestId, response.headers.get("x-request-id"));
});

test("unexpected errors keep the generic internal error response", async () => {
    const response = await fetch(baseUrl + "/health", { headers: { origin: "https://not-allowed.example" } });
    const body = await response.json() as { error: { code: string; requestId: string } };
    assert.equal(response.status, 500);
    assert.equal(body.error.code, "INTERNAL_SERVER_ERROR");
    assert.equal(JSON.stringify(body).includes("not-allowed"), false);
    assert.equal(body.error.requestId, response.headers.get("x-request-id"));
});
