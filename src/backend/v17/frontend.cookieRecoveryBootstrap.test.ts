import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

test('password recovery authority starts after cookie session restoration finishes', () => {
  let loading = true, created = 0;
  const jsx = (type: unknown, props: any) => ({ type, props });
  const dependencies: Record<string, any> = {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    react: {
      useState: (initial: any) => [typeof initial === 'function' ? initial() : initial, () => {}],
      useRef: () => ({ current: null }), useEffect: () => {},
      useSyncExternalStore: (_subscribe: any, get: any) => get(),
    },
    'react-router': { Link: 'a' },
    '../auth/AuthContext': { useAuth: () => ({ loading }) },
    '../auth/passwordRecovery': { RESET_REQUEST_MESSAGE: 'synthetic' },
    '../auth/recoveryRuntime': { passwordRecoveryEnabled: true, getPasswordRecovery: () => {
      created++; return { subscribe: () => () => {}, getSnapshot: () => ({ phase: 'invalid', message: 'synthetic' }) };
    } },
  };
  const output = ts.transpileModule(readFileSync('src/app/pages/PasswordRecovery.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} as Record<string, any> };
  new Function('require', 'exports', 'module', output)((name: string) => {
    assert.ok(name in dependencies); return dependencies[name];
  }, module.exports, module);
  const pending = module.exports.ResetPassword();
  assert.equal(created, 0); assert.match(JSON.stringify(pending.props), /ログイン状態を確認/);
  loading = false; const ready = module.exports.ResetPassword(); ready.type(ready.props);
  assert.equal(created, 1);
});
