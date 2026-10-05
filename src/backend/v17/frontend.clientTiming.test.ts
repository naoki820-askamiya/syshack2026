import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { clientTiming, createClientTiming } from '../../app/utils/clientTiming.js';

import { captureAuthBoundary, setAuthenticatedUser } from '../../app/utils/authBoundary.js';

const boundary = { userId: 'synthetic-private-user', epoch: 1 };
const flush = () => new Promise<void>(done => setImmediate(done));
function clockFixture(now?: () => number, emit?: () => void) {
  let time = 10, current = { ...boundary };
  const deferred: Array<() => void> = [];
  const output: unknown[] = [];
  const timing = createClientTiming({ now: now ?? (() => time), current: b => b.userId === current.userId && b.epoch === current.epoch,
    emit: event => { output.push(event); emit?.(); }, defer: task => deferred.push(task) });
  return { timing, output, set time(value: number) { time = value; }, get time() { return time; },
    switch: () => { current = { ...current, epoch: current.epoch + 1 }; }, drain: () => { while (deferred.length) deferred.shift()!(); } };
}
function ready(flow: ReturnType<typeof clockFixture>, lease: ReturnType<typeof flow.timing.claim>) { flow.timing.stage(lease, 'result_ready'); flow.timing.finish(lease); }

test('client timing correlates submit/ACK/accepted state/result/logical finish using opaque metadata only', () => {
  const flow = clockFixture(); const token = flow.timing.begin('submit', boundary);
  flow.time = 20; flow.timing.ack(token, 'synthetic-private-case'); flow.timing.handoff(token);
  const lease = flow.timing.claim('synthetic-private-case', boundary);
  flow.time = 30; flow.timing.stage(lease, 'state'); flow.time = 40; ready(flow, lease);
  assert.deepEqual(flow.timing.read().map(event => [event.origin, event.milestone, event.elapsed_ms]),
    [['submit', 'submit', 0], ['submit', 'case_ack', 10], ['submit', 'state', 20], ['submit', 'result_ready', 30], ['submit', 'logical_finish', 30]]);
  const encoded = JSON.stringify(flow.output); assert.equal(encoded.includes('synthetic-private'), false);
  for (const event of flow.timing.read()) assert.deepEqual(Object.keys(event).sort(), ['elapsed_ms', 'milestone', 'origin', 'trace']);
});

test('absent/throwing/invalid/descending clocks and throwing sink never affect business callers', () => {
  for (const now of [() => { throw new Error('no Performance'); }, () => NaN, () => Infinity, () => -1, () => undefined as unknown as number]) {
    const flow = clockFixture(now); assert.doesNotThrow(() => ready(flow, flow.timing.claim('case', boundary))); assert.deepEqual(flow.timing.read(), []);
  }
  const flow = clockFixture(undefined, () => { throw new Error('sink unavailable'); });
  const token = flow.timing.begin('submit', boundary); flow.timing.ack(token, 'case'); const lease = flow.timing.claim('case', boundary);
  flow.time = 9; ready(flow, lease); assert.equal(flow.timing.read().some(event => event.milestone === 'logical_finish'), false);
  flow.time = 15; assert.doesNotThrow(() => ready(flow, lease));
});

test('auth epoch change rejects old callbacks and explicit clearing removes observations', () => {
  const flow = clockFixture(); const lease = flow.timing.claim('case', boundary); flow.switch(); ready(flow, lease);
  assert.deepEqual(flow.timing.read(), []); flow.timing.clear(); assert.equal(flow.timing.size(), 0);
});

test('StrictMode-like cleanup/setup invalidates old lease but preserves one handoff trace', () => {
  const flow = clockFixture(); const token = flow.timing.begin('submit', boundary); flow.timing.ack(token, 'case'); flow.timing.handoff(token);
  const old = flow.timing.claim('case', boundary); flow.timing.release(old);
  const next = flow.timing.claim('case', boundary); flow.drain(); ready(flow, old);
  assert.equal(flow.timing.read().some(event => event.milestone === 'result_ready'), false);
  ready(flow, next); assert.equal(flow.timing.read().filter(event => event.milestone === 'logical_finish').length, 1);
  assert.equal(flow.timing.read().every(event => event.trace === token?.trace), true);
});

test('pending unmount cancels observations and late completion cannot republish them', () => {
  const flow = clockFixture(); const lease = flow.timing.claim('case', boundary); flow.timing.release(lease); flow.drain(); ready(flow, lease);
  assert.deepEqual(flow.timing.read(), []);
  const token = flow.timing.begin('submit', boundary); flow.timing.cancelSubmit(token); flow.timing.ack(token, 'case'); assert.deepEqual(flow.timing.read(), []);
});

test('cached reload and explicit retry never invent submit/ACK or finish a prior failed attempt', () => {
  const flow = clockFixture(); const initial = flow.timing.claim('case', boundary); flow.timing.stage(initial, 'state');
  flow.timing.retry('case', boundary); const next = flow.timing.claim('case', boundary); ready(flow, initial); ready(flow, next);
  assert.deepEqual(flow.timing.read().map(event => [event.origin, event.milestone]), [['reload', 'state'], ['retry', 'result_ready'], ['retry', 'logical_finish']]);
});

test('missing saved result and failures never emit successful logical completion', () => {
  const flow = clockFixture(); const lease = flow.timing.claim('case', boundary); flow.timing.stage(lease, 'state'); flow.timing.finish(lease);
  const token = flow.timing.begin('submit', boundary); flow.timing.ack(token, 'other'); flow.timing.fail(token);
  assert.equal(flow.timing.read().some(event => event.milestone === 'logical_finish'), false);
});

test('private correlations and emitted observations remain bounded to32 traces', () => {
  const flow = clockFixture();
  for (let index = 0; index < 100; index++) ready(flow, flow.timing.claim('synthetic-private-' + index, boundary));
  assert.equal(flow.timing.size(), 32); assert.ok(flow.timing.read().length <= 160);
});

function actualModule(path: string, deps: Record<string, unknown> = {}) {
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const module = { exports: {} as Record<string, any> };
  new Function('require', 'exports', 'module', code)((id: string) => {
    if (!Object.hasOwn(deps, id)) throw new Error('Unexpected dependency ' + id); return deps[id];
  }, module.exports, module); return module.exports;
}
const jsx = (type: unknown, props: Record<string, any>) => ({ type, props });
function tree(value: any): any[] { return Array.isArray(value) ? value.flatMap(tree) : value && typeof value === 'object' && value.props ? [value, ...tree(value.props.children)] : []; }
const normalized = actualModule('src/app/utils/analysisViewModel.ts');
const validResult = { result: { analysis: { emotionScoreAnalysis: { scores: Object.fromEntries(
  ['anger','coldness','distance','busyness','flatness','reassurance'].map(key => [key, { score: 1 }])) } } } };
function hookFixture(flow: ReturnType<typeof clockFixture>, options: { cached?: boolean; missing?: boolean; fail?: boolean; pending?: Promise<void> } = {}) {
  let cache: unknown = options.cached ? validResult : undefined; let starts = 0; const states: any[] = []; let index = 0;
  const effects: Array<() => any> = []; let cleanups: any[] = [];
  const hook = actualModule('src/app/hooks/useHydratedAnalysis.ts', {
    react: { useState: (initial: any) => { const slot = index++; if (!(slot in states)) states[slot] = typeof initial === 'function' ? initial() : initial; return [states[slot], (value: any) => { states[slot] = typeof value === 'function' ? value(states[slot]) : value; }]; }, useEffect: (effect: () => any) => effects.push(effect) },
    'react-router': { useLocation: () => ({ pathname: '/analysis/case', search: '', hash: '', state: null }), useNavigate: () => () => {} },
    '../auth/AuthContext': { useAuth: () => ({ authEpoch: boundary.epoch }) },
    '../api/sessionV17': { analyze: async () => { starts++; if (options.fail) throw new Error('synthetic private error'); cache = validResult; }, hydrateAnalysis: async () => { if (options.pending) await options.pending; if (options.fail) throw new Error('synthetic private error'); if (!options.missing) cache = validResult; return !options.missing; } },
    '../api/client': { fetchApiJson: async (path: string) => path.endsWith('/results/latest') ? { result: {} } : { analysisCase: { status: 'analyzed' } } },
    '../utils/storage': { getConsultation: () => ({ id: 'case' }), getAnalysis: () => cache },
    '../utils/analysisViewModel': normalized, '../utils/analysisRetry': actualModule('src/app/utils/analysisRetry.ts'),
    '../utils/authBoundary': { captureAuthBoundary: () => boundary, assertCurrentAuthBoundary: () => {}, isCurrentAuthBoundary: () => true },
    '../utils/clientTiming': { clientTiming: flow.timing },
  });
  const render = () => { index = 0; effects.length = 0; const value = hook.useHydratedAnalysis('case'); cleanups = effects.map(effect => effect()); return value; };
  return { render, close: () => cleanups.forEach(fn => fn?.()), get starts() { return starts; } };
}

test('actual hook observes cached result readiness without submit/ACK or provider invocation', async () => {
  const flow = clockFixture(); const hook = hookFixture(flow, { cached: true }); hook.render(); await flush();
  assert.deepEqual(flow.timing.read().map(event => [event.origin, event.milestone]), [['reload', 'result_ready'], ['reload', 'logical_finish']]);
  assert.equal(hook.starts, 0); hook.close();
});

test('actual New page hands submit/ACK correlation to actual hydration hook without route contract changes', async () => {
  const flow = clockFixture(); const states: any[] = [], refs: any[] = [], effects: Array<() => any> = []; let index = 0, ref = 0;
  const navigation: unknown[] = [];
  const page = actualModule('src/app/pages/NewConsultation.tsx', {
    react: { useState: (initial: any) => { const slot = index++; if (!(slot in states)) states[slot] = typeof initial === 'function' ? initial() : initial; return [states[slot], (value: any) => { states[slot] = typeof value === 'function' ? value(states[slot]) : value; }]; }, useRef: (initial: unknown) => refs[ref++] ??= { current: initial }, useEffect: (effect: () => any) => effects.push(effect) },
    'react/jsx-runtime': { jsx, jsxs: jsx }, 'react-router': { useNavigate: () => (...args: unknown[]) => navigation.push(args), useSearchParams: () => [new URLSearchParams()] },
    'lucide-react': new Proxy({}, { get: (_object, key) => String(key) }),
    '../api/sessionV17': { createPerson: async () => ({ person: { id: 'private-person' } }), createAnalysisCase: async () => { flow.time = 20; return { analysisCase: { id: 'case' } }; } },
    '../api/client': { fetchApiJson: () => { throw new Error('unexpected GET'); } },
    '../utils/authBoundary': { captureAuthBoundary: () => boundary, isCurrentAuthBoundary: () => true, assertCurrentAuthBoundary: () => {} },
    '../api/consultationMapper': { relationshipLabel: () => '上司' }, '../utils/storage': { getConsultations: () => [], saveConsultation: () => {} },
    '../utils/relationStyles': { getRelationStyle: () => ({}) }, '../components/Navigation': { Navigation: () => null },
    '../utils/consultationHistory': { findLatestConsultationByPersonId: () => undefined, getLatestConsultationsByPerson: () => [] },
    './newConsultationModel': actualModule('src/app/pages/newConsultationModel.ts'), '../utils/clientTiming': { clientTiming: flow.timing },
  });
  const render = () => { index = 0; ref = 0; effects.length = 0; return tree(page.NewConsultation()); };
  render(); states[0] = { ...states[0], personName: 'synthetic private name', event: 'synthetic private body', userAction: 'synthetic private action' };
  const nodes = render(); const cleanups = effects.map(effect => effect());
  await nodes.find(node => node.type === 'form')!.props.onSubmit({ preventDefault() {} });
  assert.deepEqual(flow.timing.read().map(event => event.milestone), ['submit', 'case_ack']);
  assert.deepEqual(navigation, [['/analysis/case', { state: { startAnalysis: true } }]]);
  cleanups.forEach(fn => fn?.()); flow.drain();
  flow.time = 30; const hook = hookFixture(flow); hook.render(); await flush();
  assert.equal(flow.timing.read().every(event => event.origin === 'submit'), true);
  assert.equal(flow.timing.read().at(-1)?.milestone, 'logical_finish');
  assert.equal(JSON.stringify(flow.timing.read()).includes('private'), false); hook.close();
});

for (const options of [{ missing: true }, { fail: true }]) test('actual hook never finishes without a usable saved result: ' + JSON.stringify(options), async () => {
  const flow = clockFixture(); const hook = hookFixture(flow, options); hook.render(); await flush();
  assert.equal(flow.timing.read().some(event => event.milestone === 'logical_finish'), false); hook.close(); flow.drain();
});


test('production native Performance adapter remains harmless when unavailable or methods throw', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'performance');
  setAuthenticatedUser('synthetic-native-user'); const auth = captureAuthBoundary();
  try {
    Object.defineProperty(globalThis, 'performance', { configurable: true, value: undefined });
    assert.equal(clientTiming.begin('submit', auth), null);
    Object.defineProperty(globalThis, 'performance', { configurable: true, value: {
      now: () => 1, measure: () => { throw new Error('unsupported native Performance'); }, clearMeasures: () => { throw new Error('unsupported clear'); },
    } });
    assert.doesNotThrow(() => { const token = clientTiming.begin('submit', auth); clientTiming.ack(token, 'private-native-case'); clientTiming.clear(); });
    assert.equal(clientTiming.size(), 0);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'performance', descriptor); else delete (globalThis as any).performance;
    setAuthenticatedUser(null);
  }
});

test('actual hook pending unmount rejects a late hydrated result observation', async () => {
  let done!: () => void; const pending = new Promise<void>(resolve => { done = resolve; });
  const flow = clockFixture(); const hook = hookFixture(flow, { pending }); hook.render(); await flush();
  hook.close(); flow.drain(); done(); await flush(); assert.deepEqual(flow.timing.read(), []);
});

test('actual hook explicit retry retires old observer and late hydration finishes only retry epoch', async () => {
  let done!: () => void; const pending = new Promise<void>(resolve => { done = resolve; });
  const flow = clockFixture(); const hook = hookFixture(flow, { pending }); const value = hook.render(); await flush();
  value.retry(); hook.close(); hook.render(); done(); await flush(); flow.drain();
  const completed = flow.timing.read().filter(event => event.milestone === 'logical_finish');
  assert.equal(completed.length, 1); assert.equal(completed[0].origin, 'retry');
  assert.equal(flow.timing.read().filter(event => event.origin === 'retry').some(event => ['submit', 'case_ack'].includes(event.milestone)), false);
  hook.close();
});


test('actual cached hook StrictMode-like cleanup/setup records one readiness/completion trace', async () => {
  const flow = clockFixture(); const hook = hookFixture(flow, { cached: true });
  hook.render(); hook.close(); hook.render(); flow.drain(); await flush();
  assert.equal(flow.timing.read().filter(event => event.milestone === 'result_ready').length, 1);
  assert.equal(flow.timing.read().filter(event => event.milestone === 'logical_finish').length, 1);
  hook.close(); flow.drain();
  const remount = hookFixture(flow, { cached: true }); remount.render();
  assert.equal(flow.timing.read().filter(event => event.milestone === 'logical_finish').length, 2, 'later genuine remount is a distinct reload trace');
  remount.close();
});

test('production native measures are evicted with the32-trace bound and auth clear', () => {
  setAuthenticatedUser('synthetic-native-user'); const auth = captureAuthBoundary();
  try {
    for (let index = 0; index < 100; index++) { const lease = clientTiming.claim('private-native-case-' + index, auth); clientTiming.stage(lease, 'result_ready'); clientTiming.finish(lease); }
    const measures = performance.getEntriesByType('measure').filter(entry => entry.name.startsWith('kigen.client.'));
    assert.equal(clientTiming.size(), 32); assert.equal(measures.length, 64);
    assert.equal(JSON.stringify(measures).includes('private-native'), false);
  } finally { setAuthenticatedUser(null); }
  assert.equal(performance.getEntriesByType('measure').filter(entry => entry.name.startsWith('kigen.client.')).length, 0);
});


test('native output stays bounded even when native measure works but clearing throws', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'performance');
  const entries: string[] = [];
  setAuthenticatedUser('synthetic-native-clear-failure'); const auth = captureAuthBoundary();
  try {
    Object.defineProperty(globalThis, 'performance', { configurable: true, value: {
      now: () => 1, measure: (name: string) => { entries.push(name); }, clearMeasures: () => { throw new Error('unavailable clearing'); },
    } });
    for (let index = 0; index < 200; index++) { const lease = clientTiming.claim('private-case-' + index, auth); clientTiming.stage(lease, 'result_ready'); clientTiming.finish(lease); }
    assert.equal(clientTiming.size(), 32); assert.equal(entries.length, 160);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'performance', descriptor); else delete (globalThis as any).performance;
    setAuthenticatedUser(null);
  }
});
