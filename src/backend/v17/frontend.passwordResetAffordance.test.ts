import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

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

test('Login explains unavailable password reset without a misleading interactive reset control', () => {
  const tree = renderLogin();
  assert.ok(tree.some(node => node.type === 'p' && text(node) === 'パスワード再設定は現在利用できません。'));
  const interactive = tree.filter(node => ['button', 'a', 'Link'].includes(String(node.type)));
  assert.equal(interactive.some(node => /パスワード.*(忘れ|再設定)/.test(text(node))), false);
  assert.ok(interactive.some(node => node.props.type === 'submit' && text(node) === 'ログイン'));
  assert.ok(interactive.some(node => text(node) === '新規登録'));
});

test('password reset honesty fix preserves the existing Supabase session configuration', () => {
  const source = ts.createSourceFile('supabase.ts', readFileSync('src/app/auth/supabase.ts', 'utf8'), ts.ScriptTarget.Latest, true);
  let options: ts.ObjectLiteralExpression | undefined;
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'createClient') {
      const last = node.arguments[2]; if (last && ts.isObjectLiteralExpression(last)) options = last;
    }
    ts.forEachChild(node, visit);
  }
  visit(source); assert.ok(options);
  const auth = options.properties.find(property => ts.isPropertyAssignment(property) && property.name.getText(source) === 'auth') as ts.PropertyAssignment;
  assert.ok(auth && ts.isObjectLiteralExpression(auth.initializer));
  const settings = Object.fromEntries(auth.initializer.properties.map(property => {
    assert.ok(ts.isPropertyAssignment(property)); return [property.name.getText(source), property.initializer.getText(source)];
  }));
  assert.deepEqual(settings, { autoRefreshToken: 'false', detectSessionInUrl: 'true', persistSession: 'false' });
});
