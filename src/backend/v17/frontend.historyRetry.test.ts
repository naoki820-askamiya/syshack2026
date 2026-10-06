import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function actualModule(path: string, deps: Record<string, unknown> = {}) {
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const module = { exports: {} as Record<string, any> };
  new Function('require', 'exports', 'module', code)((id: string) => {
    if (!Object.hasOwn(deps, id)) throw new Error('Unexpected dependency ' + id);
    return deps[id];
  }, module.exports, module);
  return module.exports;
}
type Node = { type: unknown; props: Record<string, any> };
function nodes(root: unknown): Node[] {
  if (Array.isArray(root)) return root.flatMap(nodes);
  if (!root || typeof root !== 'object' || !('props' in root)) return [];
  const node = root as Node;
  return [node, ...nodes(node.props.children)];
}
function text(root: unknown): string {
  if (Array.isArray(root)) return root.map(text).join('');
  if (typeof root === 'string' || typeof root === 'number') return String(root);
  return root && typeof root === 'object' && 'props' in root ? text((root as Node).props.children) : '';
}
const consultation = (id: string, personId: string) => ({
  id, personId, personName: 'Synthetic name', relation: '友人', event: 'Synthetic event',
  reaction: '分からない', userAction: '', timing: '翌日', createdAt: '2026-10-05T00:00:00Z',
});
function fixture(load: (options: { signal: AbortSignal }) => Promise<unknown[]>, pageName: 'History' | 'Home' = 'History') {
  const auth = actualModule('src/app/utils/authBoundary.ts');
  let userId: string | null = 'synthetic-A';
  auth.setAuthenticatedUser(userId);
  const states: any[] = [];
  let stateIndex = 0, effectIndex = 0;
  const effects: Array<{ deps?: unknown[]; run: () => any; cleanup?: () => void; pending: boolean }> = [];
  const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
  const page = actualModule('src/app/pages/' + pageName + '.tsx', {
    react: {
      useMemo: (compute: () => unknown) => compute(),
      useState: (initial: any) => {
        const slot = stateIndex++;
        if (!(slot in states)) states[slot] = typeof initial === 'function' ? initial() : initial;
        return [states[slot], (next: any) => { states[slot] = typeof next === 'function' ? next(states[slot]) : next; }];
      },
      useEffect: (run: () => any, deps?: unknown[]) => {
        const slot = effectIndex++, previous = effects[slot];
        if (!previous || !deps || deps.some((value, i) => !Object.is(value, previous.deps?.[i]))) {
          effects[slot] = { run, deps, cleanup: previous?.cleanup, pending: true };
        }
      },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-router': { Link: 'Link', useNavigate: () => () => {}, useSearchParams: () => [params], useParams: () => ({}) },
    'lucide-react': new Proxy({}, { get: (_target, key) => String(key) }),
    '../utils/storage': { getConsultations: () => [] },
    '../api/sessionV17': { loadConsultationHistory: load },
    '../utils/homeHistoryModel': actualModule('src/app/utils/homeHistoryModel.ts'),
    '../utils/randomSubtitle': { getRandomSubtitle: () => 'Synthetic subtitle' },
    '../utils/consultationHistory': actualModule('src/app/utils/consultationHistory.ts'),
    '../auth/AuthContext': { useAuth: () => ({ user: userId ? { id: userId } : null, authEpoch: auth.captureAuthBoundary().epoch, loading: false }) },
    '../utils/authBoundary': auth,
    '../components/Navigation': { Navigation: 'Navigation' },
    '../utils/relationStyles': { getRelationStyle: () => ({}), getReactionStyle: () => ({}) },
  });
  const params = new URLSearchParams('personId=person-A');
  const render = () => {
    stateIndex = 0; effectIndex = 0;
    const tree = nodes(page[pageName]());
    for (const effect of effects) if (effect.pending) {
      effect.cleanup?.(); effect.cleanup = effect.run(); effect.pending = false;
    }
    return tree;
  };
  return { render, close: () => effects.forEach(effect => effect.cleanup?.()), states,
    switchUser: (id: string) => { userId = id; auth.setAuthenticatedUser(id); } };
}

test('History recovers failed GET through inline retry and preserves selected Person ID', async () => {
  let calls = 0, resolve!: (value: unknown[]) => void;
  const next = new Promise<unknown[]>(done => { resolve = done; });
  const flow = fixture(() => ++calls === 1 ? Promise.reject(new Error('Synthetic request unavailable')) : next);
  flow.render(); await new Promise<void>(done => setImmediate(done));
  let tree = flow.render();
  const retry = tree.find(node => node.type === 'button' && text(node).includes('履歴を再取得'));
  assert.ok(retry, 'failed History read must expose inline retry');
  assert.ok(tree.some(node => node.props.role === 'alert' && text(node).includes('Synthetic request unavailable')));
  retry.props.onClick(); flow.render(); tree = flow.render();
  assert.equal(calls, 2);
  assert.ok(tree.some(node => node.props.role === 'status' && text(node).includes('読み込んで')));
  assert.equal(tree.some(node => text(node).includes('Synthetic request unavailable')), false);
  resolve([consultation('case-A', 'person-A'), consultation('case-B', 'person-B')]);
  await new Promise<void>(done => setImmediate(done)); tree = flow.render();
  assert.equal(tree.some(node => node.props.role === 'alert'), false);
  assert.ok(tree.some(node => node.type === 'Link' && node.props.to === '/analysis/case-A'));
  assert.equal(tree.some(node => node.type === 'Link' && node.props.to === '/analysis/case-B'), false);
  assert.ok(tree.some(node => node.type === 'Link' && node.props.to === '/new?personId=person-A'));
  flow.close();
});

test('History ignores a delayed read after unmount instead of updating the previous page', async () => {
  let resolve!: (value: unknown[]) => void;
  const pending = new Promise<unknown[]>(done => { resolve = done; });
  const flow = fixture(() => pending);
  flow.render(); flow.close();
  const snapshot = structuredClone(flow.states);
  resolve([consultation('case-old', 'person-A')]);
  await new Promise<void>(done => setImmediate(done));
  assert.deepEqual(flow.states, snapshot);
});

test('History cancels cleanup/remount and hides old user rows before a new load completes', async () => {
  const signals: AbortSignal[] = []; let resolveSecond!: (rows: unknown[]) => void;
  const second = new Promise<unknown[]>(done => { resolveSecond = done; });
  const flow = fixture(({ signal }) => {
    signals.push(signal);
    return signals.length === 1 ? Promise.resolve([consultation('case-A', 'person-A')]) : second;
  });
  flow.render(); await new Promise<void>(done => setImmediate(done));
  assert.ok(flow.render().some(node => node.type === 'Link' && node.props.to === '/analysis/case-A'));
  flow.switchUser('synthetic-B');
  assert.equal(flow.render().some(node => node.type === 'Link' && node.props.to === '/analysis/case-A'), false);
  assert.equal(signals[0].aborted, true); assert.equal(signals.length, 2);
  flow.close(); assert.equal(signals[1].aborted, true);
  const snapshot = structuredClone(flow.states); resolveSecond([consultation('case-B', 'person-A')]);
  await new Promise<void>(done => setImmediate(done)); assert.deepEqual(flow.states, snapshot);
});

test('Home cancels its caller-owned history load on unmount without updating old state', async () => {
  let signal!: AbortSignal, resolve!: (rows: unknown[]) => void;
  const pending = new Promise<unknown[]>(done => { resolve = done; });
  const flow = fixture(options => { signal = options.signal; return pending; }, 'Home');
  flow.render(); assert.equal(signal.aborted, false); flow.close(); assert.equal(signal.aborted, true);
  const snapshot = structuredClone(flow.states); resolve([consultation('case-old', 'person-A')]);
  await new Promise<void>(done => setImmediate(done)); assert.deepEqual(flow.states, snapshot);
});
