import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function actualModule(path: string, deps: Record<string, unknown> = {}) {
  const source = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} as Record<string, any> };
  new Function('require', 'exports', 'module', source)((id: string) => {
    if (!Object.hasOwn(deps, id)) throw new Error('Unexpected dependency ' + id);
    return deps[id];
  }, module.exports, module);
  return module.exports;
}
type Node = { type: unknown; props: Record<string, any> };
function nodes(value: unknown): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== 'object' || !('props' in value)) return [];
  const node = value as Node;
  return [node, ...nodes(node.props.children)];
}
function scenario(options: { create?: (body: any) => Promise<unknown>; failure?: unknown; snapshot?: unknown } = {}) {
  const states: any[] = []; let index = 0;
  const refs: any[] = []; let refIndex = 0;
  const jsx = (type: unknown, props: Record<string, unknown>) => ({ type, props });
  const current = { userId: 'synthetic-A', epoch: 1 };
  let creates = 0; const personBodies: any[] = []; const caseBodies: any[] = []; const saved: any[] = []; const navigation: unknown[] = [];
  const page = actualModule('src/app/pages/NewConsultation.tsx', {
    react: { useState: (initial: any) => { const slot = index++; if (!(slot in states)) states[slot] = typeof initial === 'function' ? initial() : initial; return [states[slot], (value: any) => { states[slot] = typeof value === 'function' ? value(states[slot]) : value; }]; },
      useRef: (initial: unknown) => { const slot = refIndex++; return refs[slot] ??= { current: initial }; }, useEffect: () => {} },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-router': { useNavigate: () => (...args: unknown[]) => navigation.push(args), useSearchParams: () => [new URLSearchParams()] },
    'lucide-react': new Proxy({}, { get: (_target, key) => String(key) }),
    '../api/sessionV17': { createPerson: async (body: unknown) => { creates++; personBodies.push(body); throw new Error('Standalone Person API must never be used'); },
      createAnalysisCase: async (body: unknown) => { caseBodies.push(body); if (options.create) return options.create(body); if (caseBodies.length === 1) throw options.failure ?? new Error('synthetic Case400'); return { analysisCase: { id: 'saved-case', personId: 'atomic-person', personSnapshot: options.snapshot } }; } },
    '../api/client': { fetchApiJson: () => { throw new Error('unexpected GET'); } },
    '../utils/clientTiming': { clientTiming: new Proxy({}, { get: () => () => null }) },
    '../utils/authBoundary': { captureAuthBoundary: () => ({ ...current }), isCurrentAuthBoundary: (b: any) => b.userId === current.userId && b.epoch === current.epoch, assertCurrentAuthBoundary: (b: any) => { if (b.userId !== current.userId || b.epoch !== current.epoch) throw new Error('synthetic stale'); } },
    '../api/consultationMapper': actualModule('src/app/api/consultationMapper.ts'),
    '../utils/storage': { getConsultations: () => [], saveConsultation: (value: unknown) => saved.push(value) },
    '../utils/relationStyles': { getRelationStyle: () => ({}) },
    '../components/Navigation': { Navigation: () => null },
    '../components/LegalLinks': { LegalLinks: () => null }, '../legal/documents': { dataHandlingNotice: 'Storage notice' },
    '../components/PersonEditor': { PersonEditor: () => null },
    '../utils/consultationHistory': { findLatestConsultationByPersonId: () => undefined, getLatestConsultationsByPerson: () => [] },
    './newConsultationModel': actualModule('src/app/pages/newConsultationModel.ts'),
  });
  function render() { index = 0; refIndex = 0; return nodes(page.NewConsultation()); }
  render(); states[0] = { ...states[0], personName: 'Synthetic person', event: 'Synthetic event', userAction: 'Synthetic action' };
  const submit = () => render().find(n => n.type === 'form')!.props.onSubmit({ preventDefault() {} });
  return { render, submit, states, current, personBodies, caseBodies, saved, navigation, get creates() { return creates; } };
}


for (const failure of [new Error('synthetic Case400'), new TypeError('synthetic lost combined response')]) {
  test('combined creation retries one unchanged intent after ' + failure.message, async () => {
    const flow = scenario({ failure });
    await flow.submit();
    assert.equal(flow.states[0].personId, '');
    assert.equal(flow.saved.length, 0); assert.equal(flow.navigation.length, 0);
    await flow.submit();
    assert.equal(flow.creates, 0);
    assert.equal(flow.caseBodies[0].createIntentKey, flow.caseBodies[1].createIntentKey);
    assert.deepEqual(flow.caseBodies.map(body => body.newPerson), [
      { displayName: 'Synthetic person', relationshipType: '上司' },
      { displayName: 'Synthetic person', relationshipType: '上司' },
    ]);
    assert.equal(flow.saved[0].personId, 'atomic-person');
    assert.equal(flow.saved.length, 1); assert.equal(flow.navigation.length, 1);
  });
}
test('editing identity or case payload starts a distinct combined intent without standalone writes', async () => {
  const flow = scenario(); await flow.submit();
  flow.render().find(n => n.props.id === 'person-name')!.props.onChange({ target: { value: 'Different synthetic person' } });
  await flow.submit();
  assert.notEqual(flow.caseBodies[0].createIntentKey, flow.caseBodies[1].createIntentKey);
  assert.equal(flow.caseBodies[1].newPerson.displayName, 'Different synthetic person');
  flow.render().find(n => n.props.id === 'event-facts')!.props.onChange({ target: { value: 'Changed event' } });
  await flow.submit();
  assert.notEqual(flow.caseBodies[1].createIntentKey, flow.caseBodies[2].createIntentKey);
  assert.equal(flow.creates, 0);
});
test('combined retry is separated by auth epoch and server v2 identity wins', async () => {
  const flow = scenario({ snapshot: { schemaVersion: 'person-snapshot-v2', person: { displayName: 'Server snapshot', relationshipType: 'friend' } } });
  await flow.submit(); flow.current.epoch += 2; await flow.submit();
  assert.notEqual(flow.caseBodies[0].createIntentKey, flow.caseBodies[1].createIntentKey);
  assert.equal(flow.saved[0].personName, 'Server snapshot'); assert.equal(flow.saved[0].relation, '友人');
});
test('two submit calls before render send only one combined request and lock identity controls', async () => {
  let done!: (value: unknown) => void;
  const flow = scenario({ create: () => new Promise(resolve => { done = resolve; }) });
  const handler = flow.render().find(n => n.type === 'form')!.props.onSubmit;
  const first = handler({ preventDefault() {} }); await handler({ preventDefault() {} });
  assert.equal(flow.caseBodies.length, 1); assert.equal(flow.creates, 0);
  const name = flow.render().find(n => n.props.id === 'person-name')!;
  assert.equal(name.props.disabled, true);
  name.props.onChange({ target: { value: 'Other' } }); assert.equal(flow.states[0].personName, 'Synthetic person');
  done({ analysisCase: { id: 'saved-case', personId: 'atomic-person' } }); await first;
  assert.equal(flow.saved.length, 1); assert.equal(flow.navigation.length, 1);
});
test('late combined acknowledgement cannot publish across logout and same-user relogin', async () => {
  let done!: (value: unknown) => void;
  const flow = scenario({ create: () => new Promise(resolve => { done = resolve; }) });
  const pending = flow.submit(); flow.current.epoch += 2;
  done({ analysisCase: { id: 'saved-case', personId: 'atomic-person' } }); await pending;
  assert.equal(flow.states[0].personId, ''); assert.equal(flow.saved.length, 0); assert.equal(flow.navigation.length, 0);
});
test('malformed combined acknowledgement never invents a Person identity and can retry same intent', async () => {
  const flow = scenario({ create: async () => ({ analysisCase: { id: 'saved-case' } }) });
  await flow.submit(); await flow.submit();
  assert.equal(flow.saved.length, 0); assert.equal(flow.navigation.length, 0);
  assert.equal(flow.caseBodies[0].createIntentKey, flow.caseBodies[1].createIntentKey); assert.equal(flow.creates, 0);
});
