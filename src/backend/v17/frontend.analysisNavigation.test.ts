import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Execute the real hook and retry logic with strict, deterministic lifecycle/I/O seams.
// This verifies hook wiring, not browser rendering or Supabase timing.
function actualModule(path: string, dependencies: Record<string, unknown> = {}) {
  const code = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} as Record<string, any> };
  new Function('require', 'exports', 'module', code)((id: string) => {
    if (!Object.hasOwn(dependencies, id)) throw new Error('Unexpected dependency ' + id);
    return dependencies[id];
  }, module.exports, module);
  return module.exports;
}
const retryLogic = actualModule('src/app/utils/analysisRetry.ts');

function scenario({ start = true, cached = false, unreadable = false } = {}) {
  let location = {
    pathname: '/analysis/synthetic-case', search: '?fixture=1', hash: '#result',
    state: start ? { startAnalysis: true, retained: 'synthetic metadata' } : null as Record<string, unknown> | null,
  };
  let serverStatus = 'draft';
  let starts = 0;
  const navigation: any[] = [];
  const boundary = { userId: 'synthetic-user', epoch: 1 };
  async function mount() {
    const states: any[] = [];
    let index = 0;
    let effects: Array<() => void | (() => void)> = [];
    let cleanups: Array<void | (() => void)> = [];
    const hook = actualModule('src/app/hooks/useHydratedAnalysis.ts', {
      react: {
        useEffect: (effect: () => void) => effects.push(effect),
        useState: (initial: any) => {
          const slot = index++;
          if (!(slot in states)) states[slot] = typeof initial === 'function' ? initial() : initial;
          return [states[slot], (next: any) => { states[slot] = typeof next === 'function' ? next(states[slot]) : next; }];
        },
      },
      'react-router': {
        useLocation: () => location,
        useNavigate: () => (target: any, options: any) => {
          navigation.push({ target, options });
          location = { ...location, ...target, state: options.state };
        },
      },
      '../auth/AuthContext': { useAuth: () => ({ authEpoch: 1 }) },
      '../api/sessionV17': {
        analyze: async (id: string) => {
          assert.equal(id, 'synthetic-case');
          starts += 1; serverStatus = 'failed'; throw new Error('synthetic provider failure');
        },
        hydrateAnalysis: async () => { throw new Error('unexpected hydration'); },
      },
      '../api/client': {
        fetchApiJson: async (path: string) => {
          if (unreadable) throw new Error('synthetic state unavailable');
          return path.endsWith('/results/latest') ? { result: null } : { analysisCase: { status: serverStatus } };
        },
      },
      '../utils/storage': { getConsultation: () => cached ? {} : undefined, getAnalysis: () => cached ? {} : undefined },
      '../utils/analysisViewModel': { normalizeAnalysis: () => cached ? {} : null },
      '../utils/analysisRetry': retryLogic,
      '../utils/clientTiming': { clientTiming: new Proxy({}, { get: () => () => null }) },
    '../utils/authBoundary': {
        captureAuthBoundary: () => boundary, assertCurrentAuthBoundary: () => {}, isCurrentAuthBoundary: () => true,
      },
    });
    async function render() {
      index = 0; effects = [];
      const value = hook.useHydratedAnalysis('synthetic-case');
      cleanups = effects.map(effect => effect());
      await new Promise<void>(resolve => setImmediate(resolve));
      return value;
    }
    const value = await render();
    return {
      value,
      close: () => cleanups.forEach(cleanup => { if (typeof cleanup === 'function') cleanup(); }),
      retry: async () => {
        cleanups.forEach(cleanup => { if (typeof cleanup === 'function') cleanup(); });
        value.retry();
        await render();
      },
    };
  }
  return { mount, navigation, get starts() { return starts; }, get location() { return location; } };
}

test('fresh Case navigation consumes only its start flag and remount cannot implicitly retry failure', async () => {
  const flow = scenario();
  const first = await flow.mount();
  assert.equal(flow.starts, 1);
  first.close();
  const second = await flow.mount();
  assert.equal(flow.starts, 1);
  assert.equal(flow.navigation.length, 1);
  assert.equal(flow.navigation[0].options.replace, true);
  assert.deepEqual(flow.location.state, { retained: 'synthetic metadata' });
  assert.equal(flow.location.pathname, '/analysis/synthetic-case');
  assert.equal(flow.location.search, '?fixture=1');
  assert.equal(flow.location.hash, '#result');
  second.close();
});

test('explicit retry after a failed remount starts the same saved Case once', async () => {
  const flow = scenario();
  const first = await flow.mount(); first.close();
  const second = await flow.mount();
  assert.equal(flow.starts, 1);
  await second.retry();
  assert.equal(flow.starts, 2);
  second.close();
});

test('plain draft reload does not start a provider run', async () => {
  const flow = scenario({ start: false });
  const mount = await flow.mount();
  assert.equal(flow.starts, 0);
  assert.equal(flow.navigation.length, 0);
  mount.close();
});

test('cached result consumes navigation start intent without a provider run', async () => {
  const flow = scenario({ cached: true });
  const mount = await flow.mount();
  assert.equal(flow.starts, 0);
  assert.equal(flow.navigation.length, 1);
  assert.deepEqual(flow.location.state, { retained: 'synthetic metadata' });
  mount.close();
});

test('state lookup failure consumes navigation intent and a remount still sends no analysis', async () => {
  const flow = scenario({ unreadable: true });
  const first = await flow.mount(); first.close();
  const second = await flow.mount();
  assert.equal(flow.starts, 0);
  assert.equal(flow.navigation.length, 1);
  second.close();
});
