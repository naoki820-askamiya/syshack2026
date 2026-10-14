import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

type Opening = ts.JsxOpeningElement | ts.JsxSelfClosingElement;
function inspect(page: string) {
  const source = readFileSync(page, 'utf8');
  const syntax = ts.transpileModule(source, { reportDiagnostics: true, compilerOptions: { jsx: ts.JsxEmit.ReactJSX } });
  assert.equal(syntax.diagnostics?.length ?? 0, 0, `${page} must be valid TSX`);
  const tree = ts.createSourceFile(page, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const elements: Opening[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) elements.push(node);
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return { elements, tree };
}
function attribute(element: Opening, name: string): string | undefined {
  const item = element.attributes.properties.find((value): value is ts.JsxAttribute => ts.isJsxAttribute(value) && value.name.getText() === name);
  if (!item) return undefined;
  return item.initializer && ts.isStringLiteral(item.initializer) ? item.initializer.text : item.initializer?.getText() ?? 'true';
}
function tag(element: Opening) { return element.tagName.getText(); }

for (const page of ['NewConsultation', 'Login', 'Register', 'Consent']) {
  test(`${page} editable controls have unique IDs and real associated names`, () => {
    const { elements, tree } = inspect(`src/app/pages/${page}.tsx`);
    const labels = new Set(elements.filter((element) => tag(element) === 'label').map((element) => attribute(element, 'htmlFor')).filter(Boolean));
    const ids = new Set<string>();
    for (const element of elements.filter((value) => ['input', 'textarea', 'select'].includes(tag(value)))) {
      const line = tree.getLineAndCharacterOfPosition(element.getStart()).line + 1;
      const id = attribute(element, 'id');
      assert.ok(id, `${page}:${line} input ID missing`);
      assert.equal(ids.has(id), false, `${page}:${line} duplicate ID ${id}`);
      ids.add(id);
      assert.ok(labels.has(id) || attribute(element, 'aria-label'), `${page}:${line} no linked label or accessible name`);
    }
  });
}

test('consultation choice groups are natively named and selection buttons expose pressed state', () => {
  const { elements } = inspect('src/app/pages/NewConsultation.tsx');
  const groups = elements.filter((value) => tag(value) === 'fieldset');
  assert.ok(groups.length >= 4, 'relationship/reaction/timing/action groups need fieldsets');
  for (const group of groups) {
    const parent = group.parent;
    assert.ok(ts.isJsxElement(parent) && parent.children.some((child) => ts.isJsxElement(child) && child.openingElement.tagName.getText() === 'legend'), 'fieldset needs a legend');
  }
  const choices = elements.filter((value) => tag(value) === 'button' && /setFormData|setActionMode|setChatPlatform|setChatSender/.test(attribute(value, 'onClick') ?? ''));
  assert.ok(choices.length > 0);
  for (const choice of choices) assert.ok(attribute(choice, 'aria-pressed'), 'choice selection must not rely on color');
  const remove = elements.find((value) => tag(value) === 'button' && /removeChatMessage/.test(attribute(value, 'onClick') ?? ''));
  assert.ok(remove && attribute(remove, 'aria-label'), 'icon-only delete needs a name');
  assert.equal(/hidden/.test(attribute(remove!, 'className') ?? ''), false, 'delete must be reachable without hover');
});

test('authentication forms announce errors/busy state and provide credential autofill hints', () => {
  for (const page of ['Login', 'Register']) {
    const { elements } = inspect(`src/app/pages/${page}.tsx`);
    const form = elements.find((value) => tag(value) === 'form');
    assert.ok(form && attribute(form, 'aria-busy'), `${page} busy state`);
    assert.ok(elements.some((value) => attribute(value, 'role') === 'alert'), `${page} error announcement`);
    assert.ok(elements.some((value) => attribute(value, 'role') === 'status'), `${page} pending/success announcement`);
    for (const input of elements.filter((value) => tag(value) === 'input')) assert.ok(attribute(input, 'autoComplete'), `${page} autofill hint for ${attribute(input, 'id')}`);
  }
});
