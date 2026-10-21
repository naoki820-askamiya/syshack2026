import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

test('actual API adapter sends new Person with Case in one request and keeps existing-person wire contract', async () => {
  const calls: any[] = [];
  const dependencies: Record<string, any> = {
    '../utils/authBoundary': {}, '../utils/storage': {}, './consultationMapper': {},
    './client': { fetchApiJson: async (path: string, init: any) => { calls.push({ path, init }); return { analysisCase: { id: 'saved', personId: 'server-person' } }; } },
  };
  const code = ts.transpileModule(readFileSync('src/app/api/sessionV17.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} as any };
  new Function('require', 'exports', 'module', code)((id: string) => {
    if (!Object.hasOwn(dependencies, id)) throw new Error('Unexpected dependency ' + id);
    return dependencies[id];
  }, module.exports, module);
  const fields = { userAgeRange: 'unknown', userGender: 'unknown', perceivedPartnerReaction: 'unknown', elapsedTimeType: 'unknown',
    eventFacts: 'Synthetic event', userResponseType: 'none', userResponseText: null, createIntentKey: 'synthetic-key' };
  await module.exports.createAnalysisCase({ ...fields, newPerson: { displayName: 'Synthetic person', relationshipType: '上司' } });
  assert.equal(calls.length, 1); assert.equal(calls[0].path, '/api/analysis-cases');
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].init.body), { ...fields, newPerson: { displayName: 'Synthetic person', relationshipType: 'boss' } });
  await module.exports.createAnalysisCase({ ...fields, personId: 'existing-person' });
  assert.deepEqual(JSON.parse(calls[1].init.body), { ...fields, personId: 'existing-person' });
});
