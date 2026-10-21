import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function load(path: string, deps: Record<string, any>, globals: Record<string, any> = {}) {
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const module = { exports: {} as Record<string, any> };
  new Function('require', 'exports', 'module', ...Object.keys(globals), code)((id: string) => {
    if (!Object.hasOwn(deps, id)) throw new Error('Unexpected dependency ' + id);
    return deps[id];
  }, module.exports, module, ...Object.values(globals));
  return module.exports;
}
function fixture() {
  const slots: any[] = [], effects: any[] = [];
  let index = 0;
  let scheduled: Array<() => void> = [];
  const react = {
    createContext: () => ({ Provider: 'Provider' }),
    useState: (initial: any) => {
      const slot = index++;
      if (!(slot in slots)) slots[slot] = typeof initial === 'function' ? initial() : initial;
      return [slots[slot], (value: any) => { slots[slot] = typeof value === 'function' ? value(slots[slot]) : value; }];
    },
    useRef: (initial: any) => { const slot = index++; return slots[slot] ??= { current: initial }; },
    useMemo: (fn: () => any) => fn(),
    useCallback: (fn: any, deps: any[]) => {
      const slot = index++;
      if (!slots[slot] || deps.some((dep, i) => !Object.is(dep, slots[slot].deps[i]))) slots[slot] = { fn, deps };
      return slots[slot].fn;
    },
    useEffect: (fn: () => any, deps: any[]) => {
      const slot = index++;
      const previous = effects[slot];
      if (previous && deps.every((dep, i) => Object.is(dep, previous.deps[i]))) return;
      scheduled.push(() => { previous?.cleanup?.(); effects[slot] = { deps, cleanup: fn() }; });
    },
  };
  return { react, slots,
    render: (fn: () => any) => { index = 0; scheduled = []; const value = fn(); scheduled.forEach(effect => effect()); return value; },
    close: () => effects.forEach(effect => effect?.cleanup?.()),
  };
}
const jsx = (type: any, props: any) => ({ type, props });
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const deferred = () => { let resolve!: (value: any) => void, reject!: (reason: any) => void; const promise = new Promise<any>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function nodes(value: any): any[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== 'object' || !value.props) return [];
  return [value, ...nodes(value.props.children)];
}

for (const kind of ['reject', 'returned-error', 'sync-throw']) test('session bootstrap recovers from ' + kind, async () => {
  const h = fixture(); let calls = 0, unsubscribed = 0;
  const first = deferred();
  let observer!: (event: string, session: any) => void;
  const { AuthProvider } = load('src/app/auth/AuthContext.tsx', {
    react: h.react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    './supabase': { supabase: { auth: {
      getSession: () => { calls++; if (calls > 1) return Promise.resolve({ data: { session: { user: { id: 'A' } } }, error: null }); if (kind === 'sync-throw') throw new Error('Private lookup detail'); return first.promise; },
      onAuthStateChange: (fn: any) => { observer = fn; return { data: { subscription: { unsubscribe: () => unsubscribed++ } } }; },
    } } },
    '../utils/authBoundary': { captureAuthBoundary: () => ({ epoch: 1 }), setAuthenticatedUser: () => ({ epoch: 1 }) },
    '../utils/storage': {},
  });
  const render = () => h.render(() => AuthProvider({ children: 'APP' }));
  render();
  if (kind === 'reject') first.reject(new Error('Private lookup detail'));
  else if (kind === 'returned-error') first.resolve({ data: { session: null }, error: new Error('Private lookup detail') });
  await tick();
  const failed = render();
  assert.equal(failed.props.value.loading, false);
  assert.equal(failed.props.value.user, null);
  assert.ok(nodes(failed).some(node => node.props.role === 'alert'));
  assert.equal(JSON.stringify(failed).includes('Private lookup detail'), false);
  nodes(failed).find(node => node.type === 'button').props.onClick(); render(); await tick();
  const recovered = render();
  assert.equal(recovered.props.value.user.id, 'A'); assert.equal(recovered.props.children, 'APP');
  assert.equal(calls, 2); assert.equal(unsubscribed, 1);
  observer('SIGNED_OUT', null); assert.equal(render().props.value.user, null);
  h.close();
});

for (const close of [false, true]) test('late bootstrap failure cannot override ' + (close ? 'unmount' : 'auth event'), async () => {
  const h = fixture(), pending = deferred(); let observer!: (event: string, session: any) => void;
  const { AuthProvider } = load('src/app/auth/AuthContext.tsx', {
    react: h.react, 'react/jsx-runtime': { jsx, jsxs: jsx },
    './supabase': { supabase: { auth: { getSession: () => pending.promise, onAuthStateChange: (fn: any) => { observer = fn; return { data: { subscription: { unsubscribe() {} } } }; } } } },
    '../utils/authBoundary': { captureAuthBoundary: () => ({ epoch: 1 }), setAuthenticatedUser: () => ({ epoch: 1 }) }, '../utils/storage': {},
  });
  const render = () => h.render(() => AuthProvider({ children: 'APP' })); render();
  if (close) h.close(); else observer('SIGNED_IN', { user: { id: 'B' } });
  const before = JSON.stringify(h.slots); pending.reject(new Error('Synthetic stale lookup')); await tick();
  assert.equal(JSON.stringify(h.slots), before);
  if (!close) { assert.equal(render().props.value.user.id, 'B'); assert.equal(render().props.children, 'APP'); h.close(); }
});

function polling() {
  const h = fixture(); let now = 0, epoch = 1, calls = 0, starts = 0, id = 0;
  const timers = new Map<number, { fn: () => void; due: number }>();
  const events = new Set<() => void>();
  const document = { hidden: false, addEventListener: (_name: string, fn: () => void) => events.add(fn), removeEventListener: (_name: string, fn: () => void) => events.delete(fn) };
  const { useHydratedAnalysis } = load('src/app/hooks/useHydratedAnalysis.ts', {
    react: h.react,
    'react-router': { useLocation: () => ({ state: null }), useNavigate: () => () => {} },
    '../auth/AuthContext': { useAuth: () => ({ authEpoch: epoch }) },
    '../api/sessionV17': { analyze: async () => { starts++; }, hydrateAnalysis: async () => {} },
    '../api/client': { fetchApiJson: async (path: string) => { calls++; return path.endsWith('/latest') ? { result: null } : { analysisCase: { status: 'analyzing' } }; } },
    '../utils/storage': { getConsultation: () => undefined, getAnalysis: () => undefined },
    '../utils/analysisViewModel': { normalizeAnalysis: () => null },
    '../utils/analysisRetry': load('src/app/utils/analysisRetry.ts', {}),
    '../utils/authBoundary': { captureAuthBoundary: () => epoch, assertCurrentAuthBoundary: (b: number) => assert.equal(b, epoch), isCurrentAuthBoundary: (b: number) => b === epoch },
    '../utils/clientTiming': { clientTiming: new Proxy({}, { get: () => () => null }) },
  }, { document, performance: { now: () => now }, setTimeout: (fn: () => void, delay: number) => { timers.set(++id, { fn, due: now + delay }); return id; }, clearTimeout: (key: number) => timers.delete(key) });
  const render = () => h.render(() => useHydratedAnalysis('saved-case'));
  return { render, document, timers, events, close: h.close, get calls() { return calls; }, get starts() { return starts; },
    advance: async (value: number) => { now = value; const due = [...timers].filter(([, timer]) => timer.due <= now); for (const [key, timer] of due) { timers.delete(key); timer.fn(); } await tick(); },
    visible: async (hidden: boolean) => { document.hidden = hidden; events.forEach(fn => fn()); await tick(); },
    switchUser: () => epoch++,
  };
}
test('polling deadline ends automatic checks, exposes recovery and never restarts active analysis', async () => {
  const flow = polling(); flow.render(); await tick();
  assert.equal(flow.render().status, 'analyzing');
  await flow.advance(120_000);
  const stopped = flow.render();
  assert.match(stopped.error, /自動確認を終了/); assert.equal(stopped.loading, false);
  assert.equal(stopped.status, 'analyzing'); assert.equal(flow.timers.size, 0);
  const calls = flow.calls; await flow.visible(false); assert.equal(flow.calls, calls);
  stopped.retry(); flow.render(); await tick();
  assert.equal(flow.render().error, ''); assert.equal(flow.starts, 0); assert.ok(flow.calls > calls);
  flow.close(); assert.equal(flow.events.size, 0); assert.equal(flow.timers.size, 0);
});
test('hidden polling slows to ten seconds and foreground restoration checks immediately', async () => {
  const flow = polling(); flow.document.hidden = true; flow.render(); await tick();
  assert.equal([...flow.timers.values()][0].due, 10_000);
  const calls = flow.calls; await flow.advance(2_000); assert.equal(flow.calls, calls);
  await flow.visible(false); assert.ok(flow.calls > calls); assert.equal(flow.timers.size, 1);
  assert.equal([...flow.timers.values()][0].due, 4_000);
  flow.close();
});
test('stale auth boundary and unmount stop visibility and timer work', async () => {
  const flow = polling(); flow.render(); await tick(); const calls = flow.calls;
  flow.switchUser(); await flow.visible(false); await flow.advance(120_000);
  assert.equal(flow.calls, calls); flow.close(); assert.equal(flow.events.size, 0);
});
