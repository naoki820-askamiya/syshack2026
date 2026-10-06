import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function actualModule(path: string, deps: Record<string, unknown>) {
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const module = { exports: {} as any };
  new Function('require', 'exports', 'module', code)((id: string) => {
    if (!Object.hasOwn(deps, id)) throw new Error('Unexpected dependency ' + id); return deps[id];
  }, module.exports, module);
  return module.exports;
}
type Node = { type: unknown; props: Record<string, any> };
function nodes(value: any): Node[] { return Array.isArray(value) ? value.flatMap(nodes) : value?.props ? [value, ...nodes(value.props.children)] : []; }
const flush = () => new Promise<void>(done => setImmediate(done));
function fixture(send: () => Promise<unknown> = async () => ({ person: { id: 'person-A', displayName: 'Edited', relationshipType: 'friend' } })) {
  const states: any[] = [], refs: any[] = [], effects: Array<() => any> = [];
  let index = 0, ref = 0;
  const current = { userId: 'synthetic-A', epoch: 1 };
  const saved: any[] = [], editing: boolean[] = [], requests: any[] = [];
  const jsx = (type: unknown, props: any) => ({ type, props });
  const module = actualModule('src/app/components/PersonEditor.tsx', {
    react: {
      useState: (initial: any) => { const slot = index++; if (!(slot in states)) states[slot] = typeof initial === 'function' ? initial() : initial;
        return [states[slot], (value: any) => { states[slot] = typeof value === 'function' ? value(states[slot]) : value; }]; },
      useRef: (initial: any) => refs[ref++] ??= { current: initial }, useEffect: (effect: () => any) => effects.push(effect),
    }, 'react/jsx-runtime': { jsx, jsxs: jsx },
    '../api/client': { fetchApiJson: async (url: string, init: any) => { requests.push({ url, ...init }); return send(); } },
    '../api/consultationMapper': { relationshipLabel: (value: string) => value },
    '../utils/authBoundary': { captureAuthBoundary: () => ({ ...current }),
      isCurrentAuthBoundary: (boundary: any) => boundary.userId === current.userId && boundary.epoch === current.epoch,
      assertCurrentAuthBoundary: (boundary: any) => { assert.deepEqual(boundary, current); } },
  });
  const person = { id: 'person-A', displayName: 'Current', relationshipType: 'coworker' };
  const render = () => { index = 0; ref = 0; return nodes(module.PersonEditor({ person, disabled: false, onSaved: (value: any) => saved.push(value), onEditingChange: (value: boolean) => editing.push(value) })); };
  const control = (id: string) => render().find(node => node.props.id === id)!;
  const click = (label: string) => render().find(node => node.type === 'button' && node.props.children === label)!.props.onClick();
  render(); const cleanups = effects.map(effect => effect());
  return { render, control, click, saved, editing, requests, current, unmount: () => cleanups.forEach(fn => typeof fn === 'function' && fn()) };
}

test('Person draft changes are explicit, cancel writes nothing, and saving sends the selected ID once', async () => {
  const flow = fixture();
  flow.click('相手の情報を編集');
  flow.control('edit-person-name').props.onChange({ target: { value: 'Draft only' } });
  assert.equal(flow.requests.length, 0);
  flow.click('キャンセル'); assert.equal(flow.requests.length, 0); assert.deepEqual(flow.editing, [true, false]);
  flow.click('相手の情報を編集'); assert.equal(flow.control('edit-person-name').props.value, 'Current');
  flow.control('edit-person-name').props.onChange({ target: { value: '  Edited  ' } });
  flow.control('edit-person-relation').props.onChange({ target: { value: 'friend' } });
  flow.click('相手の情報を保存'); await flush();
  assert.equal(flow.requests.length, 1); assert.equal(flow.requests[0].url, '/api/persons/person-A');
  assert.deepEqual(JSON.parse(flow.requests[0].body), { displayName: 'Edited', relationshipType: 'friend' });
  assert.equal(flow.saved.length, 1); assert.equal(flow.saved[0].id, 'person-A');
  flow.unmount();
});

test('Person PATCH failure retains the draft, announces an error, and supports an explicit retry', async () => {
  let calls = 0;
  const flow = fixture(async () => { if (++calls === 1) throw new Error('Synthetic save failure'); return { person: { id: 'person-A', displayName: 'Edited', relationshipType: 'coworker' } }; });
  flow.click('相手の情報を編集'); flow.control('edit-person-name').props.onChange({ target: { value: 'Edited' } });
  flow.click('相手の情報を保存'); await flush();
  assert.equal(flow.control('edit-person-name').props.value, 'Edited');
  assert.ok(flow.render().some(node => node.props.role === 'alert' && node.props.children === 'Synthetic save failure'));
  assert.equal(flow.saved.length, 0); flow.click('相手の情報を保存'); await flush(); assert.equal(flow.saved.length, 1);
  flow.unmount();
});

for (const invalidate of ['switch', 'same-user-relogin', 'unmount'] as const) test(`pending Person save rejects stale publication after ${invalidate}`, async () => {
  let done!: (value: unknown) => void;
  const flow = fixture(() => new Promise(resolve => { done = resolve; }));
  flow.click('相手の情報を編集');
  const save = flow.render().find(node => node.type === 'button' && node.props.children === '相手の情報を保存')!;
  save.props.onClick(); save.props.onClick(); assert.equal(flow.requests.length, 1);
  assert.equal(flow.render().find(node => node.type === 'fieldset')?.props.disabled, true);
  if (invalidate === 'unmount') flow.unmount(); else { flow.current.epoch++; if (invalidate === 'switch') flow.current.userId = 'synthetic-B'; }
  done({ person: { id: 'person-A', displayName: 'Old A data', relationshipType: 'coworker' } }); await flush();
  assert.equal(flow.saved.length, 0); assert.deepEqual(flow.editing, [true]); flow.unmount();
});

test('invalid Person draft does not dispatch and all controls have labels and explicit button types', async () => {
  const flow = fixture(); flow.click('相手の情報を編集'); flow.control('edit-person-name').props.onChange({ target: { value: ' ' } });
  flow.click('相手の情報を保存'); await flush(); assert.equal(flow.requests.length, 0);
  assert.ok(flow.render().some(node => node.props.role === 'alert'));
  for (const id of ['edit-person-name', 'edit-person-relation']) assert.ok(flow.render().some(node => node.type === 'label' && node.props.htmlFor === id));
  assert.ok(flow.render().filter(node => node.type === 'button').every(node => node.props.type === 'button'));
  flow.unmount();
});
