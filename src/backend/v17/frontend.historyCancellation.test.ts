import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { getEventListeners } from 'node:events';
import ts from 'typescript';
import { createApiClient, ApiResponseError } from '../../app/api/clientRequest.js';
import * as auth from '../../app/utils/authBoundary.js';

function actualModule(path: string, deps: Record<string, unknown> = {}, sourceOverride?: string) {
  const code = ts.transpileModule(sourceOverride ?? readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} as Record<string, any> };
  new Function('require', 'exports', 'module', code)((id: string) => {
    if (!Object.hasOwn(deps, id)) throw new Error('Unexpected dependency ' + id);
    return deps[id];
  }, module.exports, module);
  return module.exports;
}
const turn = () => new Promise<void>(done => setImmediate(done));
function fixture(baselineSources?: { loader: string; client: string }) {
  auth.setAuthenticatedUser('synthetic-A', { newSession: true });
  let active = 0, peak = 0, subscriptions = 0;
  const calls: string[] = [], writes: unknown[] = [];
  const requests: Array<{ signal: AbortSignal; fail: (error: unknown) => void; complete: (response: Response) => void }> = [];
  const makeClient = baselineSources ? actualModule('src/app/api/clientRequest.ts', { '../utils/authBoundary.js': auth }, baselineSources.client).createApiClient : createApiClient;
  const transport = makeClient({
    getSession: async () => ({ data: { session: { access_token: 'synthetic-token' } } }),
    send: async (path: string, options: RequestInit) => {
      calls.push(path);
      if (path.startsWith('/api/persons?')) return Response.json({ persons: Array.from({ length: 12 }, (_, index) => ({ id: 'person-' + index, displayName: 'Synthetic', relationshipType: 'friend' })), pagination: { hasMore: false } });
      const signal = options.signal ?? new AbortController().signal;
      signal.throwIfAborted();
      active++; peak = Math.max(peak, active);
      return new Promise<Response>((resolve, reject) => {
        let finished = false;
        const finish = (settle: () => void) => {
          if (finished) return;
          finished = true; active--;
          signal.removeEventListener('abort', onAbort);
          settle();
        };
        const onAbort = () => finish(() => reject(signal.reason));
        signal.addEventListener('abort', onAbort, { once: true });
        requests.push({ signal, fail: error => finish(() => reject(error)), complete: response => finish(() => resolve(response)) });
      });
    },
  });
  const loader = actualModule('src/app/api/sessionV17.ts', {
    '../utils/authBoundary': { ...auth, subscribeAuthBoundary: (listener: () => void) => {
      subscriptions++;
      const unsubscribe = auth.subscribeAuthBoundary(listener);
      return () => { subscriptions--; unsubscribe(); };
    } },
    '../utils/storage': { saveAnalysis: () => {}, saveConsultation: () => {}, replaceConsultations: (value: unknown) => writes.push(value) },
    './consultationMapper': actualModule('src/app/api/consultationMapper.ts'),
    './client': transport,
  }, baselineSources?.loader);
  return { loader, calls, writes, requests, get active() { return active; }, get peak() { return peak; }, get subscriptions() { return subscriptions; } };
}
function released(flow: ReturnType<typeof fixture>, signal?: AbortSignal) {
  assert.equal(flow.active, 0);
  assert.equal(flow.subscriptions, 0);
  if (signal) assert.equal(getEventListeners(signal, 'abort').length, 0);
  for (const request of flow.requests) assert.equal(getEventListeners(request.signal, 'abort').length, 0);
}

test('first typed HTTP error aborts all peers and repeated retries leave no residual network', async () => {
  const flow = fixture();
  for (let attempt = 0; attempt < 3; attempt++) {
    const base = flow.requests.length;
    const external = new AbortController();
    const operation = flow.loader.loadConsultationHistory({ signal: external.signal });
    const rejected = assert.rejects(operation, (error: any) => error instanceof ApiResponseError && error.status === 409 && error.code === 'SYNTHETIC_CONFLICT');
    await turn(); assert.equal(flow.active, 4);
    flow.requests[base].complete(Response.json({ error: { code: 'SYNTHETIC_CONFLICT', message: 'Synthetic conflict', requestId: 'synthetic-request' } }, { status: 409 }));
    await rejected; await turn(); released(flow, external.signal);
    assert.ok(flow.requests.slice(base).every(request => request.signal.aborted));
    assert.equal(flow.requests.length, base + 4);
  }
  assert.equal(flow.peak, 4); assert.equal(flow.writes.length, 0);
});

test('JSON parse failure aborts peers and preserves exact parse error without partial cache', async () => {
  const flow = fixture(); const error = new SyntaxError('Synthetic invalid JSON');
  const operation = flow.loader.loadConsultationHistory();
  const rejected = assert.rejects(operation, candidate => candidate === error);
  await turn(); const response = Response.json({});
  Object.defineProperty(response, 'json', { value: async () => { throw error; } });
  flow.requests[0].complete(response); await rejected; await turn();
  released(flow); assert.equal(flow.calls.length, 5); assert.equal(flow.writes.length, 0);
});

for (const change of ['switch', 'logout', 'relogin']) test('pending auth ' + change + ' immediately aborts peers before response completion', async () => {
  const flow = fixture(); const operation = flow.loader.loadConsultationHistory();
  const rejected = assert.rejects(operation, /ログイン状態が変わりました/);
  await turn(); assert.equal(flow.active, 4);
  if (change === 'switch') auth.setAuthenticatedUser('synthetic-B');
  if (change === 'logout') auth.setAuthenticatedUser(null);
  if (change === 'relogin') auth.setAuthenticatedUser('synthetic-A', { newSession: true });
  await rejected; await turn(); released(flow);
  assert.equal(flow.calls.length, 5); assert.equal(flow.writes.length, 0);
});

test('external cleanup cancels the load and a remount starts with no residual requests', async () => {
  const flow = fixture(); const external = new AbortController();
  const operation = flow.loader.loadConsultationHistory({ signal: external.signal });
  const rejected = assert.rejects(operation, { name: 'AbortError' });
  await turn(); external.abort(); await rejected; await turn(); released(flow, external.signal);
  const remount = new AbortController();
  const next = flow.loader.loadConsultationHistory({ signal: remount.signal });
  const nextRejected = assert.rejects(next, { name: 'AbortError' });
  await turn(); assert.equal(flow.active, 4); assert.equal(flow.peak, 4);
  remount.abort(); await nextRejected; await turn(); released(flow, remount.signal);
});

test('deadline cancels actual pending peers and late completion cannot publish or dispatch', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const flow = fixture(); const operation = flow.loader.loadConsultationHistory();
  const rejected = assert.rejects(operation, (error: any) => error instanceof flow.loader.HistoryDeadlineError && error.code === 'HISTORY_LOAD_TIMEOUT');
  await turn(); assert.equal(flow.active, 4);
  t.mock.timers.tick(flow.loader.HISTORY_LOAD_DEADLINE_MS - 1);
  await turn(); assert.equal(flow.active, 4);
  t.mock.timers.tick(1); await rejected; await turn(); released(flow);
  for (const request of flow.requests) request.complete(Response.json({ analysisCases: [], pagination: { hasMore: true } }));
  await turn(); assert.equal(flow.calls.length, 5); assert.equal(flow.writes.length, 0);
});

test('already canceled load starts no token or network work and removes owned resources', async () => {
  const flow = fixture(); const external = new AbortController(); external.abort();
  await assert.rejects(flow.loader.loadConsultationHistory({ signal: external.signal }), { name: 'AbortError' });
  released(flow, external.signal); assert.equal(flow.calls.length, 0);
});

// Optional offline probe compares the identical failed-load/retry workload against the audit HEAD.
// Production tests do not invoke Git or external services.
if (process.env.HISTORY_BASELINE_LOADER && process.env.HISTORY_BASELINE_CLIENT) {
  const baselineSources = { loader: readFileSync(process.env.HISTORY_BASELINE_LOADER, 'utf8'), client: readFileSync(process.env.HISTORY_BASELINE_CLIENT, 'utf8') };
  test('offline before/after peer residual probe', async () => {
    const measurements: unknown[] = [];
    for (const [label, source] of [['audit-HEAD', baselineSources], ['fixed', undefined]] as const) {
      const flow = fixture(source);
      for (let attempt = 0; attempt < 3; attempt++) {
        const index = flow.requests.length;
        const operation = flow.loader.loadConsultationHistory();
        const rejected = assert.rejects(operation);
        await turn();
        flow.requests[index].complete(Response.json({ error: { message: 'Synthetic failure' } }, { status: 409 }));
        await rejected; await turn();
      }
      measurements.push({ label, peakMockNetwork: flow.peak, pendingAfterThreeFailures: flow.active, cacheWrites: flow.writes.length, dispatches: flow.calls.length });
      for (const request of flow.requests) request.fail(new Error('probe cleanup'));
      await turn();
    }
    console.log('history_peer_probe ' + JSON.stringify(measurements));
  });
}
