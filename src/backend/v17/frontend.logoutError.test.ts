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
const consultation = (id: string) => ({ id, personId: id + '-person', personName: 'Synthetic name', relation: '友人',
  event: 'Synthetic private event', reaction: '分からない', userAction: '', timing: '翌日', createdAt: '2026-10-05T00:00:00Z' });
function fixture(signOut: () => Promise<void>) {
  const boundary = actualModule('src/app/utils/authBoundary.ts');
  const storage = actualModule('src/app/utils/storage.ts', { './authBoundary.js': boundary });
  let user: { id: string; email: string } | null = { id: 'synthetic-A', email: 'synthetic@example.invalid' };
  boundary.setAuthenticatedUser(user.id); storage.saveConsultation(consultation('case-A'));
  const states: any[] = []; let index = 0;
  const navigation: string[] = [];
  const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
  const page = actualModule('src/app/components/Navigation.tsx', {
    react: {
      useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
      useState: (initial: any) => {
        const slot = index++; if (!(slot in states)) states[slot] = typeof initial === 'function' ? initial() : initial;
        return [states[slot], (next: any) => { states[slot] = typeof next === 'function' ? next(states[slot]) : next; }];
      },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    'react-router': { Link: 'Link', useLocation: () => ({ pathname: '/history' }), useNavigate: () => (to: string) => navigation.push(to) },
    'lucide-react': new Proxy({}, { get: (_target, key) => String(key) }),
    '../utils/storage': storage,
    '../utils/relationStyles': { getRelationStyle: () => ({}) },
    '../auth/AuthContext': { useAuth: () => ({ user, signOut }) },
    '../utils/consultationHistory': actualModule('src/app/utils/consultationHistory.ts'),
    '../utils/navigationState': actualModule('src/app/utils/navigationState.ts'),
    '../utils/authBoundary': boundary,
  });
  const render = () => { index = 0; return nodes(page.Navigation()); };
  const button = () => render().find(node => node.type === 'button' && text(node).includes('ログアウト'))!;
  return { render, button, navigation, storage, boundary,
    switchUser: (id: string | null) => { user = id ? { id, email: 'synthetic@example.invalid' } : null; boundary.setAuthenticatedUser(id); } };
}

test('logout rejection is caught and announced; retry redirects only after SDK success', async () => {
  let calls = 0;
  const flow = fixture(async () => { calls++; if (calls === 1) throw new Error('synthetic SDK failure'); flow.switchUser(null); });
  await assert.doesNotReject(flow.button().props.onClick());
  const alert = flow.render().find(node => node.props.role === 'alert');
  assert.ok(alert && text(alert).includes('ログアウトに失敗'));
  assert.deepEqual(flow.navigation, []);
  assert.equal(flow.boundary.captureAuthBoundary().userId, 'synthetic-A');
  assert.equal(flow.storage.getConsultations()[0]?.id, 'case-A');
  assert.equal(flow.button().props.disabled, false);
  await flow.button().props.onClick();
  assert.equal(calls, 2); assert.deepEqual(flow.navigation, ['/']);
  assert.deepEqual(flow.storage.getConsultations(), []);
});

test('pending logout disables resubmission and a late A rejection cannot display in B session', async () => {
  let reject!: (cause: unknown) => void, calls = 0;
  const pending = new Promise<void>((_done, fail) => { reject = fail; });
  const flow = fixture(() => { calls++; return pending; });
  const operation = flow.button().props.onClick();
  assert.equal(flow.button().props.disabled, true);
  assert.ok(flow.render().some(node => node.props.role === 'status' && text(node).includes('ログアウト')));
  await flow.button().props.onClick(); assert.equal(calls, 1);
  flow.switchUser('synthetic-B'); flow.storage.saveConsultation(consultation('case-B'));
  reject(new Error('synthetic delayed A error')); await assert.doesNotReject(operation);
  assert.equal(flow.render().some(node => node.props.role === 'alert'), false);
  assert.equal(flow.button().props.disabled, false);
  assert.equal(flow.storage.getConsultations()[0]?.id, 'case-B');
  assert.deepEqual(flow.navigation, []);
});

test('unknown logout rejection uses a safe generic accessible message', async () => {
  const flow = fixture(async () => { throw { secret: 'synthetic must not render' }; });
  await assert.doesNotReject(flow.button().props.onClick());
  const alert = flow.render().find(node => node.props.role === 'alert');
  assert.ok(alert && text(alert).includes('ログアウトに失敗'));
  assert.equal(text(alert).includes('synthetic must not render'), false);
});
