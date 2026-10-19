import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import type { AddressInfo } from 'node:net';

process.env.DATABASE_URL = 'postgresql://synthetic:synthetic@127.0.0.1:1/offline';
for (const name of ['SUPABASE_URL', 'VITE_SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']) delete process.env[name];
const { createServerApp } = await import('../server.js');
const { prisma } = await import('../prisma/client.js');
const app = await createServerApp();
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
after(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); await prisma.$disconnect(); });

test('missing Auth config keeps liveness and anonymous /me available', async () => {
  const health = await fetch(base + '/health');
  assert.equal(health.status, 200); assert.deepEqual(await health.json(), { status: 'ok' });
  const me = await fetch(base + '/api/me');
  assert.equal(me.status, 200); assert.deepEqual(await me.json(), { user: null });
});
test('missing Auth config fails authenticated routes closed with generic 500, never 401 or identity', async () => {
  for (const path of ['/api/me', '/api/persons']) {
    const response = await fetch(base + path, { headers: { authorization: 'Bearer synthetic-token' } });
    assert.equal(response.status, 500);
    const body: any = await response.json();
    assert.equal(body.error.code, 'INTERNAL_SERVER_ERROR');
    assert.equal(body.error.message, 'サーバー内部エラーが発生しました。');
    assert.equal(body.user, undefined); assert.equal(body.persons, undefined);
  }
});
