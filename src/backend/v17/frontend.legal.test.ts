import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createHash } from 'node:crypto';
import { safeLegalReturnTo, TERMS_VERSION, PRIVACY_POLICY_VERSION, TERMS_CONTENT_SHA256, PRIVACY_CONTENT_SHA256 } from '../../shared/legal.js';
import { dataHandlingNotice, legalDraftNotice, privacyDocument, termsDocument } from '../../app/legal/documents.js';

type Element = { type: unknown; props: Record<string, any> };
const jsx = (type: unknown, props: Record<string, any>): Element => ({ type, props });
function flatten(root: any): Element[] {
  if (Array.isArray(root)) return root.flatMap(flatten);
  if (!root || typeof root !== 'object' || !root.props) return [];
  if (typeof root.type === 'function') return flatten(root.type(root.props));
  return [root, ...flatten(root.props.children)];
}
function text(root: any): string {
  if (Array.isArray(root)) return root.map(text).join('');
  if (typeof root === 'string' || typeof root === 'number') return String(root);
  if (!root?.props) return '';
  return text(typeof root.type === 'function' ? root.type(root.props) : root.props.children);
}
function load(path: string, dependencies: Record<string, any>, browserWindow?: { location: URL }) {
  const output = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} as Record<string, any> };
  new Function('require', 'exports', 'module', 'window', output)((name: string) => {
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (!(name in dependencies)) throw new Error('Unexpected dependency ' + name);
    return dependencies[name];
  }, module.exports, module, browserWindow);
  return module.exports;
}
const LegalLinks = load('src/app/components/LegalLinks.tsx', { 'react-router': { Link: 'a' } }).LegalLinks;
const documents = { dataHandlingNotice, legalDraftNotice, privacyDocument, termsDocument };

test('each consent version tracks the document content, preventing unnoticed edits under an accepted version', () => {
  for (const [document, expected] of [[termsDocument, TERMS_CONTENT_SHA256], [privacyDocument, PRIVACY_CONTENT_SHA256]] as const) {
    const actual = createHash('sha256').update(JSON.stringify({ title: document.title, notice: legalDraftNotice, sections: document.sections })).digest('hex');
    assert.equal(actual, expected, 'Document changed: update its digest so existing users must accept a new version');
    assert.ok(document.version.endsWith(actual.slice(0, 16)));
    assert.ok(document.version.length <= 50, 'existing DB version column limit');
  }
});
test('public documents disclose storage, AI transfer, draft status, retention and limited revocation', () => {
  const { LegalDocument } = load('src/app/pages/LegalDocument.tsx', { 'react-router': { Link: 'a' }, '../components/LegalLinks': { LegalLinks }, '../legal/documents': documents });
  const terms = LegalDocument({ kind: 'terms' }); const privacy = LegalDocument({ kind: 'privacy' });
  assert.ok(text(terms).includes(TERMS_VERSION)); assert.ok(text(privacy).includes(PRIVACY_POLICY_VERSION));
  for (const content of [dataHandlingNotice, legalDraftNotice]) assert.ok(text(terms).includes(content));
  for (const content of ['自動削除', '準備中', '外部サービスでの一切の保存', '過去の要約に既に含まれた内容']) assert.ok(text(privacy).includes(content), content);
  assert.ok(flatten(privacy).some(node => node.props.href === 'https://developers.openai.com/api/docs/guides/your-data'));
});
function registration(emailConfirmation = false, returnTo = '/new', save: () => Promise<unknown> = async () => ({}), resend: (email: string) => Promise<unknown> = async () => ({})) {
  const h = hooksFixture(); const navigations: any[] = []; const calls: any[] = []; const records: any[] = []; const resends: string[] = [];
  const boundary = { userId: 'registered-user', epoch: 1 }; let current = boundary;
  const { Register } = load('src/app/pages/Register.tsx', {
    react: h.react,
    'react-router': { useNavigate: () => (target: any) => navigations.push(target), useSearchParams: () => [new URLSearchParams({ returnTo })] },
    'lucide-react': { ArrowLeft: 'icon', UserPlus: 'icon' },
    '../auth/AuthContext': { useAuth: () => ({ signUp: async (...args: any[]) => { calls.push(args); return { needsEmailConfirmation: emailConfirmation, authenticatedBoundary: emailConfirmation ? null : boundary }; }, resendSignUpEmail: async (email: string) => { resends.push(email); return resend(email); } }) },
    '../components/LegalLinks': { LegalLinks }, '../legal/documents': documents, '../../shared/legal': { safeLegalReturnTo },
    '../api/consentV17': { recordConsent: () => { records.push(current); return save(); } },
    '../utils/authBoundary': { isCurrentAuthBoundary: (b: any) => b === current, assertCurrentAuthBoundary: (b: any) => { if (b !== current) throw new Error('Synthetic stale auth'); } },
  });
  const render = () => h.render(Register);
  return { render, navigations, calls, records, resends, close: h.close, changeUser: () => { current = { userId: 'another-user', epoch: 2 }; }, slots: h.slots };
}
test('registration cannot call signup before acknowledgement, with policies visible before submit', async () => {
  const f = registration(); let root = f.render(); let elements = flatten(root);
  assert.ok(text(root).includes(dataHandlingNotice)); assert.ok(elements.find(node => node.props.type === 'submit')?.props.disabled);
  await elements.find(node => node.type === 'form')!.props.onSubmit({ preventDefault() {} }); assert.equal(f.calls.length, 0);
  elements.find(node => node.props.id === 'registration-legal-confirmation')!.props.onChange({ target: { checked: true } });
  root = f.render(); elements = flatten(root); await elements.find(node => node.type === 'form')!.props.onSubmit({ preventDefault() {} });
  assert.equal(f.calls.length, 1); assert.equal(f.records.length, 1); assert.deepEqual(f.navigations, ['/new']);
  assert.ok(text(root).includes('プライバシーポリシーに同意します。')); f.close();
});

for (const origin of ['https://kigen404.vercel.app', 'https://kigen404-preview.example.com', 'http://localhost:5173'])
for (const mode of ['session', 'email', 'changed-user', 'same-user-relogin']) test(`signup returns to its origin and exposes only the current consent boundary: ${origin}, ${mode}`, async () => {
  const h = hooksFixture(); let current: { userId: string | null; epoch: number } = { userId: null, epoch: 0 };
  const calls: any[] = []; const context = { Provider: 'Provider' };
  const { AuthProvider } = load('src/app/auth/AuthContext.tsx', {
    react: { ...h.react, createContext: () => context, useContext: () => null, useCallback: (fn: any) => fn, useMemo: (fn: any) => fn() },
    './supabase': { supabase: { auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { listener: { subscription: { unsubscribe() {} } }, subscription: { unsubscribe() {} } } }),
      signUp: async (input: any) => { calls.push(input); if (mode !== 'email') current = { userId: mode === 'changed-user' ? 'another-user' : 'registered-user', epoch: mode === 'same-user-relogin' ? 3 : 1 }; return { data: { session: mode === 'email' ? null : { user: { id: 'registered-user' } }, user: { id: 'fake-unconfirmed-user' } }, error: null }; },
    } } },
    '../utils/authBoundary': { captureAuthBoundary: () => current, setAuthenticatedUser: () => current }, '../utils/storage': {},
  }, { location: new URL(`${origin}/register?returnTo=%2Fnew#synthetic-fragment`) });
  const tree = h.render(() => AuthProvider({ children: null }));
  const result = await tree.props.value.signUp('fixture@example.com', 'synthetic-password', 'Nickname');
  assert.equal(result.needsEmailConfirmation, mode === 'email');
  assert.deepEqual(result.authenticatedBoundary, mode === 'session' ? current : null);
  assert.deepEqual(calls, [{ email: 'fixture@example.com', password: 'synthetic-password', options: { emailRedirectTo: `${origin}/`, data: { display_name: 'Nickname' } } }]); h.close(); await tick();
});
for (const origin of ['https://kigen404.vercel.app', 'https://kigen404-preview.example.com', 'http://localhost:5173'])
for (const result of ['success', 'returned-error', 'rejection']) test(`signup email resend preserves its origin and hides provider errors: ${origin}, ${result}`, async () => {
  const h = hooksFixture(); const calls: any[] = [];
  const { AuthProvider } = load('src/app/auth/AuthContext.tsx', {
    react: { ...h.react, createContext: () => ({ Provider: 'Provider' }), useContext: () => null, useCallback: (fn: any) => fn, useMemo: (fn: any) => fn() },
    './supabase': { supabase: { auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      resend: async (input: any) => { calls.push(input); if (result === 'rejection') throw new Error('Private provider detail'); return { error: result === 'returned-error' ? new Error('Private provider detail') : null }; },
    } } },
    '../utils/authBoundary': { captureAuthBoundary: () => ({ userId: null, epoch: 0 }), setAuthenticatedUser: () => ({ epoch: 0 }) }, '../utils/storage': {},
  }, { location: new URL(`${origin}/signup?returnTo=https://untrusted.example/#synthetic-fragment`) });
  const tree = h.render(() => AuthProvider({ children: null }));
  if (result === 'success') await tree.props.value.resendSignUpEmail('fixture@example.com');
  else await assert.rejects(tree.props.value.resendSignUpEmail('fixture@example.com'), { message: '確認メールを再送信できませんでした。時間をおいて再試行してください。' });
  assert.deepEqual(calls, [{ type: 'signup', email: 'fixture@example.com', options: { emailRedirectTo: `${origin}/` } }]);
  h.close(); await tick();
});

test('email-confirmation registration does not falsely claim consent was stored', async () => {
  const f = registration(true); let elements = flatten(f.render());
  elements.find(node => node.props.id === 'registration-legal-confirmation')!.props.onChange({ target: { checked: true } });
  elements = flatten(f.render()); await elements.find(node => node.type === 'form')!.props.onSubmit({ preventDefault() {} });
  assert.equal(f.navigations.length, 0); assert.equal(f.records.length, 0);
  assert.ok(text(f.render()).includes('ログイン後に改めて同意を確認・記録します。'));
  assert.equal(flatten(f.render()).find(n => n.props.type === 'submit')!.props.disabled, true); f.close();
});

async function waitForConfirmation(f: ReturnType<typeof registration>) {
  let nodes = flatten(f.render());
  assert.equal(nodes.some(n => n.props.children === '確認メールを再送信'), false);
  nodes.find(n => n.props.id === 'email')!.props.onChange({ target: { value: '  fixture@example.com  ' } });
  nodes = flatten(f.render());
  nodes.find(n => n.props.id === 'registration-legal-confirmation')!.props.onChange({ target: { checked: true } });
  nodes = flatten(f.render());
  await nodes.find(n => n.type === 'form')!.props.onSubmit({ preventDefault() {} });
  return flatten(f.render()).find(n => n.type === 'button' && n.props.children === '確認メールを再送信')!;
}

test('confirmation resend waits 60 seconds, uses the registered email and suppresses duplicate requests', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const pending = deferred<void>(); const f = registration(true, '/new', undefined, () => pending.promise);
  let button = await waitForConfirmation(f);
  assert.equal(button.props.disabled, true); await button.props.onClick(); assert.deepEqual(f.resends, []);
  t.mock.timers.tick(59_000); f.render();
  assert.ok(text(f.render()).includes('あと1秒'));
  t.mock.timers.tick(1000);
  button = flatten(f.render()).find(n => n.type === 'button' && n.props.children === '確認メールを再送信')!;
  assert.equal(button.props.disabled, false);
  const first = button.props.onClick(); await button.props.onClick();
  assert.deepEqual(f.resends, ['fixture@example.com']);
  assert.ok(text(f.render()).includes('再送信中'));
  pending.resolve(); await first;
  assert.ok(text(f.render()).includes('再送信を受け付けました'));
  assert.equal(f.calls.length, 1); assert.equal(f.records.length, 0); assert.deepEqual(f.navigations, []);
  assert.equal(flatten(f.render()).find(n => n.props.children === '確認メールを再送信')!.props.disabled, true);
  f.close();
});

test('confirmation resend failure is safe, waits before retry, and can succeed later', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  let attempts = 0; const f = registration(true, '/new', undefined, async () => { if (++attempts === 1) throw new Error('Private email/provider detail'); });
  await waitForConfirmation(f); t.mock.timers.tick(60_000);
  let button = flatten(f.render()).find(n => n.props.children === '確認メールを再送信')!;
  await button.props.onClick();
  assert.ok(text(f.render()).includes('再送信できませんでした'));
  assert.equal(text(f.render()).includes('Private'), false);
  await button.props.onClick(); assert.equal(attempts, 1);
  t.mock.timers.tick(60_000);
  button = flatten(f.render()).find(n => n.props.children === '確認メールを再送信')!;
  await button.props.onClick(); assert.equal(attempts, 2);
  assert.ok(text(f.render()).includes('再送信を受け付けました')); f.close();
});

for (const outcome of ['success', 'failure']) test(`confirmation resend ${outcome} after unmount cannot update page state`, async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  const pending = deferred<void>(); const f = registration(true, '/new', undefined, () => pending.promise);
  await waitForConfirmation(f); t.mock.timers.tick(60_000);
  const completion = flatten(f.render()).find(n => n.props.children === '確認メールを再送信')!.props.onClick();
  f.close();
  const states = () => JSON.stringify(f.slots.filter(value => value === null || typeof value !== 'object'));
  const before = states();
  if (outcome === 'success') pending.resolve(); else pending.reject(new Error('Synthetic stale error'));
  await completion; t.mock.timers.tick(60_000); assert.equal(states(), before);
});

test('registration saves consent before navigation and retries only the record after account creation', async () => {
  let attempts = 0; const pending = deferred<void>();
  const f = registration(false, '/new?personId=person', () => ++attempts === 1 ? pending.promise : Promise.resolve());
  let nodes = flatten(f.render()); nodes.find(n => n.props.type === 'checkbox')!.props.onChange({ target: { checked: true } });
  nodes = flatten(f.render()); const submit = nodes.find(n => n.type === 'form')!.props.onSubmit;
  const first = submit({ preventDefault() {} }); await submit({ preventDefault() {} }); await tick();
  assert.equal(f.calls.length, 1); assert.equal(f.records.length, 1); assert.deepEqual(f.navigations, []);
  pending.reject(new Error('Synthetic save failure')); await first;
  nodes = flatten(f.render()); assert.ok(text(f.render()).includes('アカウントの登録は完了しました'));
  assert.ok(nodes.find(n => n.props.type === 'submit')!.props.children.includes('再試行'));
  await nodes.find(n => n.type === 'form')!.props.onSubmit({ preventDefault() {} });
  assert.equal(f.calls.length, 1); assert.equal(f.records.length, 2); assert.deepEqual(f.navigations, ['/new?personId=person']); f.close();
});

for (const stale of ['auth', 'unmount']) test(`registration consent response after ${stale} cannot navigate`, async () => {
  const pending = deferred<void>(); const f = registration(false, '/new', () => pending.promise);
  let nodes = flatten(f.render()); nodes.find(n => n.props.type === 'checkbox')!.props.onChange({ target: { checked: true } });
  nodes = flatten(f.render()); const completion = nodes.find(n => n.type === 'form')!.props.onSubmit({ preventDefault() {} }); await tick();
  if (stale === 'auth') f.changeUser(); else f.close();
  pending.resolve(); await completion; assert.deepEqual(f.navigations, []);
  if (stale === 'auth') { const currentNodes = flatten(f.render()); await currentNodes.find(n => n.type === 'form')!.props.onSubmit({ preventDefault() {} }); assert.equal(f.records.length, 1); }
  f.close();
});
test('consent return URL preserves local consultation destinations and blocks external or looping destinations', () => {
  for (const input of ['https://example.com', '//example.com', '/\\example.com', '/login?returnTo=x', '/consent', '/new\n']) assert.equal(safeLegalReturnTo(input), '/new');
  assert.equal(safeLegalReturnTo('/analysis/case?x=1'), '/analysis/case?x=1');
});

function hooksFixture() {
  const slots: any[] = []; let cursor = 0, effectCursor = 0;
  const effects: Array<{ deps: any[]; run: () => any; cleanup?: () => void; pending: boolean }> = [];
  const react = {
    useState: (initial: any) => { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], (v: any) => { slots[index] = typeof v === 'function' ? v(slots[index]) : v; }]; },
    useRef: (initial: any) => { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useEffect: (run: () => any, deps: any[]) => { const index = effectCursor++, previous = effects[index]; if (!previous || deps.some((v, i) => !Object.is(v, previous.deps[i]))) effects[index] = { deps, run, cleanup: previous?.cleanup, pending: true }; },
  };
  return { react, slots, render: (component: () => any) => { cursor = effectCursor = 0; const result = component(); for (const effect of effects) if (effect.pending) { effect.cleanup?.(); effect.cleanup = effect.run(); effect.pending = false; } return result; }, close: () => effects.forEach(effect => effect.cleanup?.()) };
}
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const deferred = <T,>() => { let resolve!: (value: T) => void; let reject!: (cause: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

test('consent save requires explicit action, suppresses duplicate clicks and retries failures before navigation', async () => {
  const h = hooksFixture(), pending = deferred<void>(); let calls = 0; const navigations: string[] = [];
  const { Consent } = load('src/app/pages/Consent.tsx', { react: h.react,
    'react-router': { Link: 'a', useNavigate: () => (to: string) => navigations.push(to), useSearchParams: () => [new URLSearchParams('returnTo=%2Fanalysis%2Fcase')] },
    '../components/LegalLinks': { LegalLinks }, '../legal/documents': documents, '../../shared/legal': { safeLegalReturnTo },
    '../api/consentV17': { recordConsent: () => { calls++; return calls === 1 ? pending.promise : Promise.resolve(); } },
    '../utils/authBoundary': { captureAuthBoundary: () => ({}), isCurrentAuthBoundary: () => true },
  });
  let tree = flatten(h.render(Consent)); const submit = () => tree.find(n => n.type === 'button')!.props.onClick();
  await submit(); assert.equal(calls, 0);
  tree.find(n => n.props.type === 'checkbox')!.props.onChange({ target: { checked: true } }); tree = flatten(h.render(Consent));
  const first = submit(); await submit(); assert.equal(calls, 1); assert.deepEqual(navigations, []);
  pending.reject(new Error('Synthetic unavailable')); await first; await tick();
  tree = flatten(h.render(Consent)); assert.ok(tree.some(n => n.props.role === 'alert')); assert.equal(tree.find(n => n.type === 'button')!.props.disabled, false);
  await submit(); await tick(); assert.equal(calls, 2); assert.deepEqual(navigations, ['/analysis/case']); h.close();
});

for (const stale of ['auth', 'unmount']) test(`consent response after ${stale} cannot navigate or update the old page`, async () => {
  const h = hooksFixture(), pending = deferred<void>(); let epoch = 1; const navigations: string[] = [];
  const { Consent } = load('src/app/pages/Consent.tsx', { react: h.react,
    'react-router': { Link: 'a', useNavigate: () => (to: string) => navigations.push(to), useSearchParams: () => [new URLSearchParams()] },
    '../components/LegalLinks': { LegalLinks }, '../legal/documents': documents, '../../shared/legal': { safeLegalReturnTo },
    '../api/consentV17': { recordConsent: () => pending.promise },
    '../utils/authBoundary': { captureAuthBoundary: () => epoch, isCurrentAuthBoundary: (captured: number) => epoch === captured },
  });
  let tree = flatten(h.render(Consent)); tree.find(n => n.props.type === 'checkbox')!.props.onChange({ target: { checked: true } });
  tree = flatten(h.render(Consent)); const completion = tree.find(n => n.type === 'button')!.props.onClick();
  if (stale === 'auth') epoch++; else h.close();
  const state = JSON.stringify(h.slots.slice(0, 3)); pending.resolve(); await completion; await tick();
  assert.deepEqual(navigations, []); assert.equal(JSON.stringify(h.slots.slice(0, 3)), state); h.close();
});

test('consent gate fails closed on read failure, retries, and cancels stale user responses', async () => {
  const h = hooksFixture(), pending = deferred<{ accepted: boolean }>(); let epoch = 1, calls = 0; const signals: AbortSignal[] = [];
  const { RequireConsent } = load('src/app/components/RequireConsent.tsx', { react: h.react,
    'react-router': { Navigate: 'Navigate', useLocation: () => ({ pathname: '/new', search: '?personId=person' }) },
    '../auth/AuthContext': { useAuth: () => ({ authEpoch: epoch }) },
    '../api/consentV17': { getConsent: (signal: AbortSignal) => { signals.push(signal); return ++calls === 1 ? Promise.reject(new Error('Synthetic unavailable')) : calls === 2 ? Promise.resolve({ accepted: false }) : pending.promise; } },
    '../utils/authBoundary': { captureAuthBoundary: () => epoch, isCurrentAuthBoundary: (captured: number) => captured === epoch },
  });
  const render = () => h.render(() => RequireConsent({ children: 'CONSULTATION_FORM' }));
  render(); await tick(); let root = render(); assert.ok(text(root).includes('Synthetic unavailable')); assert.ok(!text(root).includes('CONSULTATION_FORM'));
  flatten(root).find(n => n.type === 'button')!.props.onClick(); render(); await tick(); root = render();
  assert.equal(root.type, 'Navigate'); assert.equal(root.props.to, '/consent?returnTo=%2Fnew%3FpersonId%3Dperson'); assert.equal(signals[0].aborted, true);
  epoch++; render(); assert.ok(!text(render()).includes('CONSULTATION_FORM')); h.close(); const state = JSON.stringify(h.slots);
  pending.resolve({ accepted: true }); await tick(); assert.equal(JSON.stringify(h.slots), state); assert.equal(signals[2].aborted, true);
});
