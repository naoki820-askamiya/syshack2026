import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { makeValidV2Result } from '../ai/v2/testFixture.js';

function actualModule(path: string, deps: Record<string, unknown> = {}) {
  // Only replace Vite's environment adapter. The actual request/page implementation is executed.
  const source = readFileSync(path, 'utf8').replace("const serverUrl = import.meta.env?.VITE_SERVER_URL ?? '';", "const serverUrl = '';");
  const code = ts.transpileModule(source, { compilerOptions: {
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
const flush = () => new Promise<void>(done => setImmediate(done));
const approved = { enabled: true, termsVersion: 'synthetic-terms', privacyVersion: 'synthetic-privacy', consentVersion: 'synthetic-guest', notice: 'Synthetic test-only notice' };
const emptySession = (consented = false) => ({ csrfToken: 'synthetic-csrf', session: { consented, used: false }, run: null });
const safeRun = () => ({ id: 'synthetic-run', state: 'SUCCEEDED', result: makeValidV2Result(), contentUnavailable: false });

function fixture(overrides: Record<string, (...args: any[]) => Promise<any>> = {}) {
  const boundary = actualModule('src/app/utils/authBoundary.ts');
  const api = actualModule('src/app/api/guestTrial.ts', { '../utils/authBoundary.js': boundary });
  const policy = actualModule('src/shared/modelContentPolicy.ts');
  const normalizer = actualModule('src/app/utils/analysisViewModel.ts', { '../../shared/modelContentPolicy.js': policy });
  const calls: string[] = [];
  const methods: Record<string, (...args: any[]) => Promise<any>> = {
    config: async () => approved,
    session: async () => emptySession(true),
    issue: async () => emptySession(),
    consent: async () => emptySession(true),
    analyze: async () => ({ run: safeRun() }),
    erase: async () => ({ run: { ...safeRun(), result: null, contentUnavailable: true } }),
    ...overrides,
  };
  const guestClient = Object.fromEntries(Object.entries(methods).map(([name, fn]) => [name, async (...args: any[]) => { calls.push(name); return fn(...args); }]));
  const states: any[] = [], refs: any[] = [];
  const effects: Array<{ deps?: unknown[]; run: () => any; cleanup?: () => void; pending: boolean }> = [];
  let stateIndex = 0, refIndex = 0, effectIndex = 0;
  const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
  const page = actualModule('src/app/pages/GuestTrial.tsx', {
    react: {
      useState: (initial: any) => {
        const slot = stateIndex++; if (!(slot in states)) states[slot] = typeof initial === 'function' ? initial() : initial;
        return [states[slot], (next: any) => { states[slot] = typeof next === 'function' ? next(states[slot]) : next; }];
      },
      useRef: (initial: any) => { const slot = refIndex++; if (!(slot in refs)) refs[slot] = { current: initial }; return refs[slot]; },
      useEffect: (run: () => any, deps?: unknown[]) => {
        const slot = effectIndex++, previous = effects[slot];
        if (!previous || !deps || deps.some((value, index) => !Object.is(value, previous.deps?.[index]))) effects[slot] = { run, deps, cleanup: previous?.cleanup, pending: true };
      },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-router': { Link: 'Link' },
    '../auth/AuthContext': { useAuth: () => ({ user: boundary.captureAuthBoundary().userId ? { id: boundary.captureAuthBoundary().userId } : null, authEpoch: boundary.captureAuthBoundary().epoch, loading: false }) },
    '../api/guestTrial': { ...api, guestClient },
    '../utils/authBoundary': boundary,
    '../utils/analysisViewModel': normalizer,
  });
  const render = () => {
    stateIndex = 0; refIndex = 0; effectIndex = 0;
    const root = page.GuestTrial();
    for (const effect of effects) if (effect.pending) { effect.cleanup?.(); effect.cleanup = effect.run(); effect.pending = false; }
    return nodes(root);
  };
  const button = (name: string) => render().find(node => node.type === 'button' && text(node) === name);
  const enter = () => {
    render().find(node => node.type === 'input' && node.props.maxLength === 50)!.props.onChange({ target: { value: 'Synthetic nickname' } });
    render().find(node => node.type === 'textarea')!.props.onChange({ target: { value: 'Synthetic event only' } });
  };
  return { api, boundary, calls, render, button, enter, page, states, close: () => effects.forEach(effect => effect.cleanup?.()) };
}

test('guest transport sends Cookie/CSRF with no bearer, no cache and no automatic retry', async () => {
  const boundary = actualModule('src/app/utils/authBoundary.ts');
  const { createGuestClient, GuestApiError } = actualModule('src/app/api/guestTrial.ts', { '../utils/authBoundary.js': boundary });
  const calls: Array<{ path: string; options: RequestInit }> = [];
  const client = createGuestClient(async (path: string, options: RequestInit) => { calls.push({ path, options }); return Response.json({ error: { code: 'SYNTHETIC_FAILURE', message: 'private trace must not escape' } }, { status: 500 }); });
  await assert.rejects(client.analyze('csrf-value', 'intent-value', { synthetic: true }), (cause: any) => cause instanceof GuestApiError && !cause.message.includes('private trace'));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/api/guest/analyze');
  assert.equal(calls[0].options.credentials, 'include'); assert.equal(calls[0].options.cache, 'no-store');
  const headers = new Headers(calls[0].options.headers);
  assert.equal(headers.get('Authorization'), null); assert.equal(headers.get('X-Guest-CSRF'), 'csrf-value');
  assert.equal(headers.get('Content-Type'), 'application/json');
});

test('guest transport rejects account switches during body parsing and authenticated dispatch', async () => {
  const boundary = actualModule('src/app/utils/authBoundary.ts');
  const { createGuestClient } = actualModule('src/app/api/guestTrial.ts', { '../utils/authBoundary.js': boundary });
  let finish!: (value: unknown) => void, sends = 0;
  const client = createGuestClient(async () => { sends++; return { ok: true, json: () => new Promise(done => { finish = done; }) }; });
  const pending = client.session(); await flush();
  boundary.setAuthenticatedUser('synthetic-account'); finish({ private: 'old guest data' });
  await assert.rejects(pending, /ログイン状態/);
  await assert.rejects(client.issue(), /ログイン状態/); assert.equal(sends, 1);
});

test('guest content deletion sends a JSON body so the server content-type guard can verify it', async () => {
  const boundary = actualModule('src/app/utils/authBoundary.ts');
  const { createGuestClient } = actualModule('src/app/api/guestTrial.ts', { '../utils/authBoundary.js': boundary });
  const calls: Array<{ path: string; options: RequestInit }> = [];
  const client = createGuestClient(async (path: string, options: RequestInit) => {
    calls.push({ path, options }); return Response.json({ run: null });
  });
  await client.erase('synthetic-csrf');
  assert.equal(calls.length, 1); assert.equal(calls[0].path, '/api/guest/content');
  assert.equal(calls[0].options.method, 'DELETE'); assert.equal(calls[0].options.body, '{}');
  const headers = new Headers(calls[0].options.headers);
  assert.equal(headers.get('Content-Type'), 'application/json');
  assert.equal(headers.get('X-Guest-CSRF'), 'synthetic-csrf');
});

test('guest page mount/reload is read-only; OFF and incomplete config never expose issuance', async () => {
  for (const config of [{ enabled: false }, { enabled: true }]) {
    const flow = fixture({ config: async () => config }); flow.render(); await flush();
    assert.deepEqual(flow.calls, ['config', 'session']);
    assert.equal(flow.button('ゲスト利用権を発行する'), undefined);
    assert.equal(flow.render().some(node => node.type === 'form'), false);
    flow.button('固定デモを見る')!.props.onClick();
    assert.ok(flow.render().some(node => text(node).includes('固定デモ（AI送信なし）')));
    assert.equal(flow.calls.includes('analyze'), false); flow.close();
  }
});

test('cookie round-trip failure is accessible and does not enable consent or generation', async () => {
  let gets = 0; let ErrorClass: any;
  const flow = fixture({ session: async () => { gets++; throw new ErrorClass(404, undefined); } }); ErrorClass = flow.api.GuestApiError;
  flow.render(); await flush(); flow.button('ゲスト利用権を発行する')!.props.onClick(); await flush();
  assert.equal(gets, 2); assert.equal(flow.calls.filter(name => name === 'issue').length, 1);
  assert.ok(flow.render().some(node => node.props.role === 'alert' && text(node).includes('Cookie')));
  assert.equal(flow.button('同意して入力へ進む'), undefined);
  assert.equal(flow.render().some(node => node.type === 'form'), false); assert.equal(flow.calls.includes('analyze'), false); flow.close();
});

test('input errors consume nothing; 50 duplicate form operations dispatch once and UNKNOWN refresh is GET only', async () => {
  let reject!: (cause: Error) => void;
  const pending = new Promise<unknown>((_done, fail) => { reject = fail; });
  const flow = fixture({ analyze: async () => pending }); flow.render(); await flush();
  flow.render().find(node => node.type === 'form')!.props.onSubmit({ preventDefault() {} }); await flush();
  assert.equal(flow.calls.includes('analyze'), false);
  flow.enter(); const form = flow.render().find(node => node.type === 'form')!;
  for (let index = 0; index < 50; index++) form.props.onSubmit({ preventDefault() {} });
  assert.equal(flow.calls.filter(name => name === 'analyze').length, 1);
  reject(new Error('Synthetic wire failure')); await flush();
  assert.equal(flow.render().some(node => node.type === 'form'), false);
  assert.ok(flow.render().some(node => text(node).includes('自動再送しません')));
  flow.button('結果を確認する')!.props.onClick(); await flush();
  assert.equal(flow.calls.filter(name => name === 'analyze').length, 1);
  assert.equal(flow.calls.filter(name => name === 'session').length, 2); flow.close();
});

test('guest acknowledgement is explicit and duplicate consent clicks never create analysis', async () => {
  const flow = fixture({ session: async () => emptySession(false) }); flow.render(); await flush();
  assert.equal(flow.button('同意して入力へ進む')!.props.disabled, true);
  flow.button('同意して入力へ進む')!.props.onClick(); await flush();
  assert.equal(flow.calls.includes('consent'), false);
  flow.render().find(node => node.type === 'input' && node.props.type === 'checkbox')!.props.onChange({ target: { checked: true } });
  const consent = flow.button('同意して入力へ進む')!;
  for (let index = 0; index < 50; index++) consent.props.onClick();
  await flush();
  assert.equal(flow.calls.filter(name => name === 'consent').length, 1);
  assert.equal(flow.calls.includes('analyze'), false);
  assert.ok(flow.render().some(node => node.type === 'form')); flow.close();
});

test('an in-flight analysis announces processing rather than UNKNOWN before its response arrives', async () => {
  let resolve!: (value: unknown) => void;
  const pending = new Promise(done => { resolve = done; });
  const flow = fixture({ analyze: async () => pending }); flow.render(); await flush(); flow.enter();
  flow.render().find(node => node.type === 'form')!.props.onSubmit({ preventDefault() {} });
  const processing = flow.render();
  assert.ok(processing.some(node => node.props.role === 'status' && text(node).includes('分析を処理しています')));
  assert.equal(processing.some(node => text(node).includes('送信の結果を確定できません')), false);
  assert.equal(flow.calls.filter(name => name === 'analyze').length, 1);
  resolve({ run: safeRun() }); await flush();
  assert.ok(flow.render().some(node => node.props.role === 'status' && text(node).includes('分析が完了しました')));
  assert.equal(flow.calls.filter(name => name === 'analyze').length, 1); flow.close();
});

test('results remain visible and deletable while new admissions are disabled; no registration gate', async () => {
  const flow = fixture({ config: async () => ({ enabled: false }), session: async () => ({ ...emptySession(true), session: { consented: true, used: true }, run: safeRun() }) });
  flow.render(); await flush();
  assert.ok(flow.render().some(node => text(node).includes('登録せずに結果を確認できます')));
  assert.ok(flow.render().some(node => node.type === 'h3' && text(node) === '状況の整理'));
  assert.equal(flow.render().some(node => node.type === 'form'), false);
  flow.button('入力と結果を削除する')!.props.onClick(); await flush();
  assert.ok(flow.render().some(node => text(node).includes('内容は削除されたか')));
  assert.equal(flow.button('入力と結果を削除する')!.props.disabled, true);
  assert.equal(flow.calls.filter(name => name === 'erase').length, 1); flow.close();
});

test('unsafe stored guest output never renders dangerous instructions or replies', async () => {
  const unsafe = makeValidV2Result(); unsafe.summary.oneLine = 'パスワードを教えてください';
  const flow = fixture({ session: async () => ({ ...emptySession(true), session: { consented: true, used: true }, run: { ...safeRun(), result: unsafe } }) });
  flow.render(); await flush(); const rendered = flow.render();
  assert.ok(rendered.some(node => node.props.role === 'alert' && text(node).includes('表示を停止')));
  assert.equal(rendered.some(node => text(node).includes('パスワードを教えてください')), false); flow.close();
});

test('late guest completion cannot publish through login/logout into a fresh guest epoch', async () => {
  let resolve!: (value: unknown) => void;
  const pending = new Promise(done => { resolve = done; });
  const flow = fixture({ analyze: async () => pending }); flow.render(); await flush(); flow.enter();
  flow.render().find(node => node.type === 'form')!.props.onSubmit({ preventDefault() {} });
  flow.boundary.setAuthenticatedUser('synthetic-account');
  assert.equal(flow.render().some(node => text(node).includes('Synthetic nickname')), false);
  flow.boundary.setAuthenticatedUser(null); flow.render(); await flush();
  const before = structuredClone(flow.states);
  resolve({ run: safeRun() }); await flush();
  assert.deepEqual(flow.states, before);
  assert.equal(flow.render().some(node => node.type === 'h3' && text(node) === '状況の整理'), false); flow.close();
});

test('a stale submit handler cannot adopt a new anonymous epoch before React rerenders', async () => {
  const flow = fixture(); flow.render(); await flush(); flow.enter();
  const oldSubmit = flow.render().find(node => node.type === 'form')!.props.onSubmit;
  const before = structuredClone(flow.states);
  flow.boundary.setAuthenticatedUser('synthetic-account'); flow.boundary.setAuthenticatedUser(null);
  oldSubmit({ preventDefault() {} }); await flush();
  assert.equal(flow.calls.includes('analyze'), false);
  assert.deepEqual(flow.states, before);
  flow.close();
});

test('a proven pre-dispatch cancellation permits only an explicit new input and submission', async () => {
  const cancelled = { ...safeRun(), state: 'CANCELLED', result: null, contentUnavailable: true, canStartNewIntent: true };
  const flow = fixture({ session: async () => ({ ...emptySession(true), run: cancelled }) });
  flow.render(); await flush();
  assert.equal(flow.calls.includes('analyze'), false);
  flow.button('新しい入力に戻る')!.props.onClick(); await flush();
  assert.equal(flow.calls.includes('analyze'), false);
  assert.ok(flow.render().some(node => node.type === 'form'));
  flow.enter(); flow.render().find(node => node.type === 'form')!.props.onSubmit({ preventDefault() {} }); await flush();
  assert.equal(flow.calls.filter(name => name === 'analyze').length, 1); flow.close();
});

test('a revoked cancellation cannot expose a new-input action even though no provider send occurred', async () => {
  const cancelled = { ...safeRun(), state: 'CANCELLED', result: null, contentUnavailable: true, canStartNewIntent: false };
  const flow = fixture({ session: async () => ({ ...emptySession(true), run: cancelled }) });
  flow.render(); await flush();
  assert.equal(flow.button('新しい入力に戻る'), undefined);
  assert.equal(flow.render().some(node => node.type === 'form'), false);
  assert.equal(flow.calls.includes('analyze'), false); flow.close();
});
