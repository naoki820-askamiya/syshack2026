import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test, { before, after } from 'node:test';

// Synthetic package regression only. No app Auth, database, credentials or provider modules.
const dependencyRoot = resolve(process.env.R10_DEPENDENCY_ROOT ?? process.cwd());
const requireDependency = createRequire(resolve(dependencyRoot, 'package.json'));
const qs = requireDependency('qs');
const express = requireDependency('express');
let server, baseUrl;
before(async () => {
  const app = express();
  app.use(express.json({ limit: '100kb' }));
  app.get('/query', (req, res) => res.json(req.query));
  app.post('/body', (req, res) => res.json(req.body));
  app.use((error, _req, res, _next) => res.status(error.status ?? 500).json({ type: error.type ?? 'unexpected' }));
  server = app.listen(0, '127.0.0.1');
  await new Promise((done, reject) => { server.once('listening', done); server.once('error', reject); });
  baseUrl = 'http://127.0.0.1:' + server.address().port;
});
after(async () => { await new Promise((done, reject) => server.close(error => error ? reject(error) : done())); });

test('qs bracket comma values honor the configured array limit', () => {
  // Small fixture for GHSA-x5fp-wj9c-mxmx; comma:true is not mounted by this app.
  assert.throws(() => qs.parse('items[]=a,b,c,d', { comma: true, arrayLimit: 3, throwOnLimitExceeded: true }), RangeError);
});
test('qs parsed constructor data can be serialized without calling a non-function', () => {
  // Small fixture for GHSA-4mjr-xmp4-gh2g; this app has no qs.stringify sink.
  const parsed = qs.parse('item[constructor][isBuffer]=synthetic', { allowPrototypes: true });
  assert.doesNotThrow(() => qs.stringify(parsed));
});
test('actual Express extended query parsing preserves ordinary pagination and nested arrays', async () => {
  const response = await fetch(baseUrl + '/query?limit=50&offset=0&filter[type]=synthetic&items[]=a&items[]=b');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { limit: '50', offset: '0', filter: { type: 'synthetic' }, items: ['a', 'b'] });
});
test('actual body-parser JSON preserves nested synthetic input and booleans', async () => {
  const body = { synthetic: { value: 'fixture' }, allowed: false };
  const response = await fetch(baseUrl + '/body', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), body);
});
for (const fixture of [
  { name: 'malformed', body: '{', status: 400, type: 'entity.parse.failed' },
  { name: 'oversized', body: JSON.stringify({ synthetic: 'x'.repeat(103000) }), status: 413, type: 'entity.too.large' },
]) test('actual body-parser ' + fixture.name + ' JSON keeps the parser error contract', async () => {
  const response = await fetch(baseUrl + '/body', { method: 'POST', headers: { 'content-type': 'application/json' }, body: fixture.body });
  assert.equal(response.status, fixture.status); assert.deepEqual(await response.json(), { type: fixture.type });
});
