import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function actualModule(path: string, deps: Record<string, unknown> = {}) {
  const source = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} as Record<string, any> };
  new Function('require', 'exports', 'module', source)((id: string) => { if (!Object.hasOwn(deps, id)) throw new Error('Unexpected dependency ' + id); return deps[id]; }, module.exports, module);
  return module.exports;
}
const turn = () => new Promise<void>(done => setImmediate(done));
function scenario({ failurePage = -1, mutatePage = -1, persons = 12, mutation = 'switch' } = {}) {
  const current = { userId: 'synthetic-A', epoch: 1 };
  const calls: string[] = []; const writes: unknown[] = [];
  const firstError = new Error('synthetic first HTTP409'); const stale = new Error('synthetic auth epoch changed');
  let active = 0; let peak = 0; let pages = 0; let failedAt = -1; let mutatedAt = -1;
  const personRows = Array.from({ length: persons }, (_, i) => ({ id: 'person-' + i, displayName: 'Synthetic ' + i, relationshipType: 'friend' }));
  const loader = actualModule('src/app/api/sessionV17.ts', {
    '../utils/authBoundary': { subscribeAuthBoundary: () => () => {}, captureAuthBoundary: () => ({ ...current }), assertCurrentAuthBoundary: (b: any) => { if (b.userId !== current.userId || b.epoch !== current.epoch) throw stale; } },
    '../utils/storage': { saveAnalysis: () => { throw new Error('unexpected'); }, saveConsultation: () => { throw new Error('unexpected'); }, replaceConsultations: (value: unknown, b: any) => { assert.equal(b.userId, current.userId); assert.equal(b.epoch, current.epoch); writes.push(value); } },
    './consultationMapper': actualModule('src/app/api/consultationMapper.ts'),
    './client': { fetchApiJson: async (path: string) => {
      calls.push(path); active++; peak = Math.max(peak, active);
      try {
        const url = new URL(path, 'http://synthetic.invalid');
        const offset = Number(url.searchParams.get('offset'));
        await turn();
        if (url.pathname === '/api/persons') return { persons: personRows.slice(offset, offset + 50), pagination: { hasMore: offset + 50 < personRows.length } };
        const personId = url.pathname.split('/')[3];
        pages++;
        if (offset === mutatePage && mutatedAt < 0) {
          mutatedAt = calls.length;
          if (mutation === 'switch') current.userId = 'synthetic-B';
          if (mutation === 'logout') current.userId = null as any;
          current.epoch += mutation === 'relogin' ? 2 : 1;
        }
        if (offset === failurePage && personId === 'person-0') { failedAt = calls.length; throw firstError; }
        return { analysisCases: offset === 0 || offset === 50 ? Array.from({ length: 50 }, (_, within) => ({ id: personId + '-' + (offset + within), personId, eventFacts: 'synthetic event', perceivedPartnerReaction: '分からない', elapsedTimeType: '翌日', userResponseText: null, userAgeRange: '20代', userGender: '回答しない', createdAt: new Date(Date.UTC(2026,0,1) + Number(personId.split('-')[1]) * 1000 + offset + within).toISOString() })) : [], pagination: { hasMore: offset < 100 } };
      } finally { active--; }
    } },
  });
  return { run: () => loader.loadConsultationHistory(), calls, writes, firstError, stale, get active() { return active; }, get peak() { return peak; }, get pages() { return pages; }, get failedAt() { return failedAt; }, get mutatedAt() { return mutatedAt; } };
}

test('actual history loader bounds concurrency while preserving every page and newest order', async () => {
  const flow = scenario(); const rows = await flow.run();
  assert.ok(flow.peak <= 4, 'peak=' + flow.peak); assert.ok(flow.peak > 1);
  assert.equal(flow.calls.length, 37); assert.equal(rows.length, 1200); assert.equal(flow.writes.length, 1);
  assert.equal(rows[0].id, 'person-11-99'); assert.equal(rows.at(-1).id, 'person-0-0');
});

for (const page of [0, 50]) test('page failure preserves first error and stops queued persons/later pages: ' + page, async () => {
  const flow = scenario({ failurePage: page });
  await assert.rejects(flow.run(), error => error === flow.firstError);
  while (flow.active) await turn();
  assert.equal(flow.writes.length, 0);
  assert.equal(flow.calls.length, flow.failedAt, 'new requests after first failure');
  assert.ok(flow.peak <= 4);
});

for (const mutation of ['switch', 'logout', 'relogin']) test('auth ' + mutation + ' prevents new pages and cache publication', async () => {
  const flow = scenario({ mutatePage: 0, mutation });
  await assert.rejects(flow.run(), error => error === flow.stale);
  while (flow.active) await turn();
  assert.equal(flow.writes.length, 0); assert.equal(flow.calls.length, flow.mutatedAt);
});

test('empty history publishes one empty successful result', async () => {
  const flow = scenario({ persons: 0 }); assert.deepEqual(await flow.run(), []);
  assert.equal(flow.calls.length, 1); assert.deepEqual(flow.writes, [[]]);
});

function simultaneousFlow() {
  const current = { userId: 'synthetic-A', epoch: 1 };
  const calls: string[] = []; const writes: unknown[] = [];
  const requests: Array<{ resolve: (value: unknown) => void; reject: (error: unknown) => void }> = [];
  const error = new Error('synthetic exact first failure');
  const loader = actualModule('src/app/api/sessionV17.ts', {
    '../utils/authBoundary': { subscribeAuthBoundary: () => () => {}, captureAuthBoundary: () => current, assertCurrentAuthBoundary: () => {} },
    '../utils/storage': { saveAnalysis: () => {}, saveConsultation: () => {}, replaceConsultations: (value: unknown) => writes.push(value) },
    './consultationMapper': actualModule('src/app/api/consultationMapper.ts'),
    './client': { fetchApiJson: (path: string) => {
      calls.push(path);
      if (path.startsWith('/api/persons?')) return Promise.resolve({ persons: Array.from({ length: 12 }, (_, i) => ({ id: 'person-' + i, displayName: 'Synthetic', relationshipType: 'friend' })), pagination: { hasMore: false } });
      return new Promise((resolve, reject) => requests.push({ resolve, reject }));
    } },
  });
  return { operation: loader.loadConsultationHistory(), calls, writes, requests, error };
}

test('simultaneous rejected and fulfilled pages latch failure before peers can dispatch a next page', async () => {
  const flow = simultaneousFlow();
  const rejection = assert.rejects(flow.operation, error => error === flow.error);
  await turn(); const callsAtFailure = flow.calls.length;
  try {
    flow.requests[0].reject(flow.error);
    for (const peer of flow.requests.slice(1)) peer.resolve({ analysisCases: [{ id: 'synthetic', personId: 'person-1' }], pagination: { hasMore: true } });
    await turn(); await rejection;
    assert.equal(flow.calls.length, callsAtFailure); assert.equal(flow.writes.length, 0);
  } finally { for (const pending of flow.requests) pending.reject(flow.error); }
});

test('first failure returns while peers remain pending and late peer failure starts no new requests', async () => {
  const flow = simultaneousFlow(); let observed: unknown;
  const caught = flow.operation.catch((error: unknown) => { observed = error; });
  await turn(); const callsAtFailure = flow.calls.length;
  try {
    flow.requests[0].reject(flow.error); await turn();
    assert.equal(observed, flow.error);
    for (const [index, peer] of flow.requests.slice(1).entries()) {
      if (index === 0) peer.reject(new Error('synthetic later peer failure'));
      else peer.resolve({ analysisCases: [{ id: 'synthetic', personId: 'person-1' }], pagination: { hasMore: true } });
    }
    await turn(); await caught;
    assert.equal(flow.calls.length, callsAtFailure); assert.equal(flow.writes.length, 0);
  } finally { for (const pending of flow.requests) pending.reject(flow.error); }
});
