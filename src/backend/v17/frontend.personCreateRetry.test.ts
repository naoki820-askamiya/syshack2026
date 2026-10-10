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
function scenario(options: { person?: (body: any) => Promise<unknown>; failure?: unknown; snapshot?: unknown } = {}) {
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
    '../api/sessionV17': { createPerson: async (body: unknown) => { creates++; personBodies.push(body); return options.person ? options.person(body) : { person: { id: 'acknowledged-person', displayName: 'Synthetic person', relationshipType: 'boss' } }; },
      createAnalysisCase: async (body: unknown) => { caseBodies.push(body); if (caseBodies.length === 1) throw options.failure ?? new Error('synthetic Case400'); return { analysisCase: { id: 'saved-case', personSnapshot: options.snapshot } }; } },
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

for (const failure of [new Error('synthetic Case400'), new TypeError('synthetic network failure')]) {
  test('acknowledged Person is reused after ' + failure.message, async () => {
    const flow = scenario({ failure });
    await flow.submit();
    assert.equal(flow.states[0].personId, 'acknowledged-person');
    assert.equal(flow.render().find(n => n.props.person?.id === 'acknowledged-person')?.props.person.displayName, 'Synthetic person');
    await flow.submit();
    assert.equal(flow.creates, 1);
    assert.equal(flow.caseBodies[0].createIntentKey, flow.caseBodies[1].createIntentKey);
    assert.deepEqual(flow.caseBodies.map(body => body.personId), ['acknowledged-person', 'acknowledged-person']);
    assert.equal(flow.saved.length, 1); assert.equal(flow.navigation.length, 1);
  });
}

test('editing nickname after failure clears acknowledged identity and creates a new Person', async () => {
  const flow = scenario(); await flow.submit();
  assert.equal(flow.states[0].personId, 'acknowledged-person');
  flow.render().find(n => n.props.id === 'person-name')!.props.onChange({ target: { value: 'Different synthetic person' } });
  assert.equal(flow.states[0].personId, '');
  await flow.submit(); assert.equal(flow.creates, 2);
});

test('lost Person response keeps one intent for unchanged retry; new auth epoch gets a new intent', async () => {
  let calls = 0;
  const flow = scenario({ person: async () => { if (++calls < 3) throw new TypeError('Synthetic lost response'); return { person: { id: 'acknowledged-person', displayName: 'Synthetic person', relationshipType: 'boss' } }; } });
  await flow.submit(); await flow.submit();
  assert.equal(flow.personBodies[0].createIntentKey, flow.personBodies[1].createIntentKey);
  assert.match(flow.personBodies[0].createIntentKey, /^[a-f0-9-]{36}$/);
  flow.current.epoch += 2; await flow.submit();
  assert.notEqual(flow.personBodies[1].createIntentKey, flow.personBodies[2].createIntentKey);
});

test('changed Case input gets a new intent and saved snapshot supplies confirmed identity', async () => {
  const flow = scenario({ snapshot: { schemaVersion: 'person-snapshot-v1', person: { displayName: 'Server snapshot name', relationshipType: 'friend' } } });
  await flow.submit();
  flow.render().find(n => n.props.id === 'event-facts')!.props.onChange({ target: { value: 'Changed synthetic event' } });
  await flow.submit();
  assert.notEqual(flow.caseBodies[0].createIntentKey, flow.caseBodies[1].createIntentKey);
  assert.equal(flow.creates, 1);
  assert.equal(flow.saved[0].personName, 'Server snapshot name'); assert.equal(flow.saved[0].relation, '友人');
});

test('two submit calls before a React render dispatch only one Person', async () => {
  let done!: (value: unknown) => void;
  const flow = scenario({ person: () => new Promise(resolve => { done = resolve; }) });
  const handler = flow.render().find(n => n.type === 'form')!.props.onSubmit;
  const first = handler({ preventDefault() {} });
  await handler({ preventDefault() {} });
  assert.equal(flow.creates, 1);
  done({ person: { id: 'acknowledged-person', displayName: 'Synthetic person', relationshipType: 'boss' } }); await first;
});

test('discarding acknowledged edited identity starts a new Person intent even with the original name', async () => {
  let firstKey: string | undefined;
  const flow = scenario({ person: async body => {
    if (!firstKey) { firstKey = body.createIntentKey; return { person: { id: 'original-person', displayName: 'Synthetic person', relationshipType: 'boss' } }; }
    return { person: body.createIntentKey === firstKey
      ? { id: 'original-person', displayName: 'Explicitly edited name', relationshipType: 'boss' }
      : { id: 'new-person', displayName: 'Synthetic person', relationshipType: 'boss' } };
  } });
  await flow.submit();
  flow.render().find(n => n.props.person?.id === 'original-person')!.props.onSaved({ id: 'original-person', displayName: 'Explicitly edited name', relationshipType: 'boss' });
  flow.render().find(n => n.props.id === 'person-name')!.props.onChange({ target: { value: 'Synthetic person' } });
  await flow.submit();
  assert.notEqual(flow.personBodies[0].createIntentKey, flow.personBodies[1].createIntentKey);
  assert.equal(flow.states[0].personId, 'new-person'); assert.equal(flow.saved[0].personName, 'Synthetic person');
});

test('late acknowledged Person is not retained across logout and same-user relogin', async () => {
  let done!: (value: unknown) => void;
  const flow = scenario({ person: () => new Promise(resolve => { done = resolve; }) });
  const pending = flow.submit(); flow.current.epoch += 2;
  done({ person: { id: 'old-epoch-person' } }); await pending;
  assert.equal(flow.states[0].personId, ''); assert.equal(flow.caseBodies.length, 0); assert.equal(flow.saved.length, 0);
});

test('identity controls cannot rebind a pending submitted Person to another nickname', async () => {
  let done!: (value: unknown) => void;
  const flow = scenario({ person: () => new Promise(resolve => { done = resolve; }) });
  const pending = flow.submit(); const tree = flow.render();
  const name = tree.find(n => n.props.id === 'person-name')!; assert.equal(name.props.disabled, true);
  const relation = tree.find(n => n.type === 'fieldset' && JSON.stringify(n.props.children).includes('相手との関係')); assert.equal(relation?.props.disabled, true);
  name.props.onChange({ target: { value: 'Different synthetic person' } });
  assert.equal(flow.states[0].personName, 'Synthetic person');
  done({ person: { id: 'acknowledged-person', displayName: 'Synthetic person', relationshipType: 'boss' } }); await pending;
  assert.equal(flow.states[0].personId, 'acknowledged-person');
  assert.equal(flow.render().find(n => n.props.id === 'person-name')!.props.disabled, false);
});
