import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureSavedCaseAnalysis, type SavedAnalysisStatus } from '../../app/utils/analysisRetry.js';

function scenario(initial: SavedAnalysisStatus, hasResult = false) {
  let status = initial;
  let result = hasResult;
  const starts: string[] = [];
  return {
    starts,
    operations: { latest: async () => result, state: async () => status, start: async (id: string) => { starts.push(id); status = 'analyzed'; result = true; } },
    failed() { status = 'failed'; result = false; },
    completed() { status = 'analyzed'; result = true; },
  };
}

test('existing result or running case is checked before another provider run', async () => {
  const done = scenario('analyzed', true);
  assert.equal(await ensureSavedCaseAnalysis('same-case', done.operations, true), 'analyzed');
  assert.deepEqual(done.starts, []);
  const running = scenario('analyzing');
  assert.equal(await ensureSavedCaseAnalysis('same-case', running.operations, true), 'analyzing');
  assert.deepEqual(running.starts, []);
});

test('analysis failure retries the saved case without calling person/case creation again', async () => {
  let persons = 0; let cases = 0;
  const createPerson = async () => { persons += 1; return 'same-person'; };
  const createCase = async (_person: string) => { cases += 1; return 'same-case'; };
  const caseId = await createCase(await createPerson());
  const flow = scenario('draft');
  let attempt = 0;
  flow.operations.start = async (id) => { flow.starts.push(id); attempt += 1; if (attempt === 1) { flow.failed(); throw new Error('provider failure'); } flow.completed(); };
  await assert.rejects(ensureSavedCaseAnalysis(caseId, flow.operations, true), /provider failure/);
  assert.equal(await ensureSavedCaseAnalysis(caseId, flow.operations, true), 'analyzed');
  assert.deepEqual(flow.starts, ['same-case', 'same-case']);
  assert.equal(persons, 1); assert.equal(cases, 1);
});

test('lost successful response is reconciled with DB result instead of restarting', async () => {
  const flow = scenario('draft');
  flow.operations.start = async (id) => { flow.starts.push(id); flow.completed(); throw new Error('response lost'); };
  assert.equal(await ensureSavedCaseAnalysis('same-case', flow.operations, true), 'analyzed');
  assert.deepEqual(flow.starts, ['same-case']);
});

test('unreadable state and a reload of a draft do not implicitly start analysis', async () => {
  const flow = scenario('draft');
  assert.equal(await ensureSavedCaseAnalysis('same-case', flow.operations, false), 'draft');
  assert.deepEqual(flow.starts, []);
  flow.operations.latest = async () => { throw new Error('state unavailable'); };
  await assert.rejects(ensureSavedCaseAnalysis('same-case', flow.operations, true), /state unavailable/);
  assert.deepEqual(flow.starts, []);
});
