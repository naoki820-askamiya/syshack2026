import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { safeLegalReturnTo } from '../../shared/legal.js';

type Node = { type: unknown; props: Record<string, any> };
function nodes(root: unknown): Node[] {
  if (Array.isArray(root)) return root.flatMap(nodes);
  if (!root || typeof root !== 'object' || !('props' in root)) return [];
  const node = root as Node; return [node, ...nodes(node.props.children)];
}
function text(root: unknown): string {
  if (Array.isArray(root)) return root.map(text).join('');
  if (typeof root === 'string' || typeof root === 'number') return String(root);
  return root && typeof root === 'object' && 'props' in root ? text((root as Node).props.children) : '';
}
function renderLogin() {
  const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
  const deps: Record<string, unknown> = {
    react: { useState: (initial: unknown) => [initial, () => {}] },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-router': { useNavigate: () => () => {}, useSearchParams: () => [new URLSearchParams()] },
    'lucide-react': { ArrowLeft: 'ArrowLeft', LogIn: 'LogIn' },
    '../auth/AuthContext': { useAuth: () => ({ signIn: async () => {} }) },
    '../../shared/legal': { safeLegalReturnTo },
  };
  const output = ts.transpileModule(readFileSync('src/app/pages/Login.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} as Record<string, any> };
  new Function('require', 'exports', 'module', output)((id: string) => {
    if (!Object.hasOwn(deps, id)) throw new Error('Unexpected dependency ' + id);
    return deps[id];
  }, module.exports, module);
  return nodes(module.exports.Login());
}

test('Login has a working public recovery entry and retains login/register controls', () => {
  const tree = renderLogin();
  const interactive = tree.filter(node => ['button', 'a', 'Link'].includes(String(node.type)));
  assert.ok(interactive.some(node => text(node) === 'パスワードを忘れた方' && typeof node.props.onClick === 'function'));
  assert.ok(interactive.some(node => node.props.type === 'submit' && text(node) === 'ログイン'));
  assert.ok(interactive.some(node => text(node) === '新規登録'));
});

test('browser authentication uses the cookie API without a persistent Supabase SDK', () => {
  const source = readFileSync('src/app/auth/supabase.ts', 'utf8');
  assert.match(source, /createBrowserAuthClient/);
  assert.doesNotMatch(source, /createClient\(/);
  assert.doesNotMatch(source, /(?:localStorage|sessionStorage)\.setItem/);
});
