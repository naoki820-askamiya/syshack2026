import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
function load(path: string, deps: Record<string, any>, env: Record<string, unknown> = {}) {
  const source = readFileSync(path, 'utf8').replaceAll('import.meta.env', JSON.stringify(env));
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} as Record<string, any> };
  new Function('require', 'exports', 'module', output)((name: string) => {
    if (name === 'react/jsx-runtime') return { jsx: (type: any, props: any) => ({ type, props }), jsxs: (type: any, props: any) => ({ type, props }) };
    if (!(name in deps)) throw new Error('Unexpected dependency ' + name);
    return deps[name];
  }, module.exports, module);
  return module.exports;
}
function hooksFixture() {
  const slots: any[] = []; let cursor = 0, effectCursor = 0;
  const effects: Array<{ deps: any[]; run: () => any; cleanup?: () => void; pending: boolean }> = [];
  const react = {
    useCallback: (fn: any) => fn,
    useState: (initial: any) => { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], (v: any) => { slots[index] = typeof v === 'function' ? v(slots[index]) : v; }]; },
    useRef: (initial: any) => { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index]; },
    useEffect: (run: () => any, deps: any[]) => { const index = effectCursor++, previous = effects[index]; if (!previous || deps.some((v, i) => !Object.is(v, previous.deps[i]))) effects[index] = { deps, run, cleanup: previous?.cleanup, pending: true }; },
  };
  return { react, slots, render: (component: () => any) => { cursor = effectCursor = 0; const result = component(); for (const effect of effects) if (effect.pending) { effect.cleanup?.(); effect.cleanup = effect.run(); effect.pending = false; } return result; }, close: () => effects.forEach(effect => effect.cleanup?.()) };
}
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const deferred = <T,>() => { let resolve!: (value: T) => void; let reject!: (cause: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };


for (const env of [{ PROD: true }, { PROD: true, VITE_TURNSTILE_SITE_KEY: 'public-key' }, { PROD: false, VITE_TURNSTILE_SITE_KEY: 'public-key' }]) test(`configured/prod auth blocks missing token: ${JSON.stringify(env)}`, () => {
  const config = load('src/app/auth/captcha.ts', {}, env);
  for (const token of [undefined, '', '  ']) assert.throws(() => config.requireCaptchaToken(token));
  if (env.VITE_TURNSTILE_SITE_KEY) assert.doesNotThrow(() => config.requireCaptchaToken('token'));
  else assert.throws(() => config.requireCaptchaToken('token'));
});
test('local development without a key keeps existing auth usable', () => {
  const config = load('src/app/auth/captcha.ts', {}, { PROD: false });
  assert.equal(config.captchaRequired, false); config.requireCaptchaToken();
});
test('token is consumed synchronously, cannot be reused, and reset requires a new challenge', () => {
  const h = hooksFixture();
  const { useAuthCaptcha } = load('src/app/components/AuthCaptcha.tsx', { react: h.react, '../auth/captcha': { captchaRequired: true }, '../auth/turnstile': {} });
  let state = h.render(useAuthCaptcha); assert.equal(state.ready, false);
  state.onToken('single-use'); state = h.render(useAuthCaptcha); assert.equal(state.ready, true);
  assert.equal(state.takeToken(), 'single-use'); assert.equal(state.takeToken(), undefined);
  state.reset(); state = h.render(useAuthCaptcha); assert.equal(state.ready, false); assert.equal(state.generation, 1);
});
for (const failure of ['expired-callback', 'error-callback', 'timeout-callback']) test(`widget clears token on ${failure} and ignores callbacks after unmount`, async () => {
  const h = hooksFixture(); let options: any; const tokens: string[] = []; const removed: string[] = [];
  const api = { render: (_: any, opts: any) => { options = opts; return 'widget'; }, remove: (id: string) => removed.push(id) };
  const { AuthCaptcha } = load('src/app/components/AuthCaptcha.tsx', { react: h.react, '../auth/captcha': { captchaRequired: true, captchaSiteKey: 'public' }, '../auth/turnstile': { loadTurnstile: async () => api } });
  // DOM ref populated during commit, before effects run in this minimal fixture.
  const oldRef = h.react.useRef;
  h.react.useRef = (initial: any) => oldRef(initial ?? {});
  h.render(() => AuthCaptcha({ generation: 0, onToken: (v: string) => tokens.push(v) })); await tick();
  options.callback('valid'); assert.equal(tokens.at(-1), 'valid');
  options[failure](); assert.equal(tokens.at(-1), '');
  h.close(); assert.deepEqual(removed, ['widget']); const count = tokens.length;
  options.callback('late'); options[failure](); assert.equal(tokens.length, count);
});
test('unmount before script load prevents rendering a detached widget', async () => {
  const h = hooksFixture(), pending = deferred<any>(); let renders = 0;
  const { AuthCaptcha } = load('src/app/components/AuthCaptcha.tsx', { react: h.react, '../auth/captcha': { captchaRequired: true, captchaSiteKey: 'public' }, '../auth/turnstile': { loadTurnstile: () => pending.promise } });
  h.render(() => AuthCaptcha({ generation: 0, onToken() {} })); h.close();
  pending.resolve({ render() { renders++; } }); await tick(); assert.equal(renders, 0);
});
test('AuthProvider forwards CAPTCHA to both SDK methods and rejects missing proof before network', async () => {
  const h = hooksFixture(); const calls: any[] = [];
  const boundary = { userId: null, epoch: 0 };
  const { AuthProvider } = load('src/app/auth/AuthContext.tsx', {
    react: { ...h.react, createContext: () => ({ Provider: 'Provider' }), useMemo: (fn: any) => fn() },
    './captcha': { requireCaptchaToken: (token: string) => { if (!token) throw new Error('missing proof'); } },
    './supabase': { supabase: { auth: {
      getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: async (input: any) => { calls.push(input); return { data: { session: null } }; },
      signUp: async (input: any) => { calls.push(input); return { data: { session: null } }; },
    } } },
    '../utils/authBoundary': { captureAuthBoundary: () => boundary, setAuthenticatedUser: () => boundary, finishExplicitLogin: () => boundary }, '../utils/storage': {},
  });
  const auth = h.render(() => AuthProvider({ children: null })).props.value;
  await assert.rejects(auth.signIn('a@example.invalid', 'pw')); await assert.rejects(auth.signUp('a@example.invalid', 'pw'));
  assert.equal(calls.length, 0);
  await auth.signIn('a@example.invalid', 'pw', 'login-proof');
  await auth.signUp('a@example.invalid', 'pw', 'Name', 'signup-proof');
  assert.equal(calls[0].options.captchaToken, 'login-proof');
  assert.deepEqual(calls[1].options, { data: { display_name: 'Name' }, captchaToken: 'signup-proof' }); h.close(); await tick();
});

test('recovery SDK serializes the proof without changing the neutral receipt contract', async () => {
  const { sendRecoveryEmail } = await import('../../app/auth/passwordRecovery.js');
  const requests: any[] = [];
  await sendRecoveryEmail({ enabled: true, url: 'https://synthetic.invalid', key: 'synthetic-key' },
    'fixture@example.invalid', 'http://localhost', async (_input, init) => {
      requests.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ code: 'captcha_failed', msg: 'Synthetic rejection' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }, 'recovery-proof');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].gotrue_meta_security.captcha_token, 'recovery-proof');
});
