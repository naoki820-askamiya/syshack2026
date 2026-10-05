import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

// Runs actual source functions with an explicit dependency allowlist. No app API,
// database, dotenv, credentials or provider module is loaded.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const requireLocal = createRequire(import.meta.url);
const ts = requireLocal('typescript');
const sourceHashes = {};
function sourceModule(relativePath, dependencies) {
  const source = readFileSync(resolve(root, relativePath), 'utf8');
  sourceHashes[relativePath] = createHash('sha256').update(source).digest('hex');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    fileName: relativePath,
  }).outputText;
  const module = { exports: {} };
  const allowlistedRequire = (name) => {
    if (!Object.hasOwn(dependencies, name)) throw new Error(`Unexpected source dependency: ${name}`);
    return dependencies[name];
  };
  new Function('require', 'exports', 'module', compiled)(allowlistedRequire, module.exports, module);
  return module.exports;
}
const mapper = sourceModule('src/app/api/consultationMapper.ts', {});
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
const mockLatencyMs = 2;

async function scenario(personCount, casesPerPerson, failure = null) {
  const persons = Array.from({ length: personCount }, (_, index) => ({
    id: `person-${index}`, displayName: `synthetic-${index}`, relationshipType: 'friend',
  }));
  const caseMap = new Map(persons.map((person, p) => [person.id,
    Array.from({ length: casesPerPerson }, (_, c) => ({
      id: `case-${p}-${c}`, personId: person.id, eventFacts: 'synthetic fixture',
      perceivedPartnerReaction: '分からない', elapsedTimeType: '翌日', userResponseText: null,
      userAgeRange: '20s', userGender: 'unspecified',
      createdAt: new Date(Date.UTC(2026, 0, 1) + (p * casesPerPerson + c) * 1000).toISOString(),
    })),
  ]));
  let repoCalls = { listPersons: 0, findOwnedPerson: 0, listCases: 0 };
  const forbidden = () => { throw new Error('Unexpected mutation or provider access'); };
  const http = { parseOrThrow: (_schema, query) => query, resourceNotFound: () => new Error('Synthetic not found') };
  const schemas = { paginationSchema: {}, buildPersonSnapshot: forbidden, createAnalysisCaseSchema: {} };
  const personService = sourceModule('src/backend/v17/persons.service.ts', {
    './schemas.js': schemas, './http.js': http,
    './persons.repository.js': {
      listOwnedPersons: async (_user, limit, offset) => {
        repoCalls.listPersons++;
        return { persons: persons.slice(offset, offset + limit), total: persons.length };
      },
      findOwnedPerson: async (_user, personId) => {
        repoCalls.findOwnedPerson++;
        return persons.find((person) => person.id === personId) ?? null;
      },
    },
  });
  const caseService = sourceModule('src/backend/v17/workflow.service.ts', {
    '../ai/v2/constants.js': {}, '../ai/v2/analyzeMood.js': {}, '../utils/index.js': {},
    './context.repository.js': {}, './http.js': http, './schemas.js': schemas,
    './persons.service.js': personService, './rateLimit.js': {},
    './workflow.repository.js': {
      listCases: async (_user, personId, limit, offset) => {
        repoCalls.listCases++;
        return caseMap.get(personId).slice(offset, offset + limit);
      },
    },
  });
  const boundary = Object.freeze({ userId: 'synthetic-user', epoch: 1 });
  let active = 0, peakConcurrency = 0, responseBytes = 0, successfulRequests = 0, cacheWrites = 0;
  const requestLog = [];
  if (global.gc) global.gc();
  const before = process.memoryUsage();
  let highestSampledHeap = before.heapUsed;
  let highestSampledRss = before.rss;
  const sampleMemory = () => {
    const sample = process.memoryUsage();
    highestSampledHeap = Math.max(highestSampledHeap, sample.heapUsed);
    highestSampledRss = Math.max(highestSampledRss, sample.rss);
  };
  const fetchApiJson = async (path) => {
    const url = new URL(path, 'http://synthetic.invalid');
    const query = { limit: Number(url.searchParams.get('limit')), offset: Number(url.searchParams.get('offset')) };
    assert.equal(query.limit, 50);
    assert.ok(Number.isSafeInteger(query.offset) && query.offset >= 0);
    requestLog.push(path); active++; peakConcurrency = Math.max(peakConcurrency, active); sampleMemory();
    try {
      await delay(mockLatencyMs);
      if (failure && path === failure.path) throw new Error('Synthetic HTTP failure');
      let payload;
      if (url.pathname === '/api/persons') payload = await personService.listPersons(boundary.userId, query);
      else {
        const match = url.pathname.match(/^\/api\/persons\/(person-\d+)\/analysis-cases$/);
        if (!match) throw new Error(`Unexpected API path: ${path}`);
        payload = await caseService.listCasesByPerson(boundary.userId, match[1], query);
      }
      // Approximate the frontend's parsed HTTP payload: serialize and parse actual service output.
      const json = JSON.stringify(payload); responseBytes += Buffer.byteLength(json, 'utf8'); successfulRequests++;
      return JSON.parse(json);
    } finally { active--; sampleMemory(); }
  };
  const loader = sourceModule('src/app/api/sessionV17.ts', {
    '../utils/authBoundary': { captureAuthBoundary: () => boundary, assertCurrentAuthBoundary: (value) => assert.equal(value, boundary) },
    '../utils/storage': { saveAnalysis: forbidden, saveConsultation: forbidden, replaceConsultations: (_value, captured) => { assert.equal(captured, boundary); cacheWrites++; } },
    './client': { fetchApiJson }, './consultationMapper': mapper,
  });
  let result = null, error = null;
  const started = performance.now();
  try { result = await loader.loadConsultationHistory(); }
  catch (cause) { error = cause.message; }
  const returnedAfterMs = performance.now() - started;
  const requestsAtReturn = requestLog.length;
  const activeAtReturn = active;
  sampleMemory();
  // Promise.all reports the first failure promptly. Observe in-flight peer settling before the next scenario.
  do { await delay(1); } while (active > 0);
  const settledAfterMs = performance.now() - started;
  sampleMemory();
  const after = process.memoryUsage();
  const expectedSuccessRequests = Math.ceil(personCount / 50) + personCount * (Math.floor(casesPerPerson / 50) + 1);
  if (!failure) {
    assert.equal(error, null); assert.equal(result.length, personCount * casesPerPerson);
    assert.equal(requestLog.length, expectedSuccessRequests); assert.equal(cacheWrites, 1);
    assert.equal(result[0].id, `case-${personCount - 1}-${casesPerPerson - 1}`);
  } else { assert.equal(error, 'Synthetic HTTP failure'); assert.equal(cacheWrites, 0); }
  return {
    persons: personCount, casesPerPerson, failure: failure?.id ?? null,
    status: error ? 'rejected' : 'loaded', returnedCases: result?.length ?? 0,
    requestCount: requestLog.length, requestsAtReturn, requestsAfterReturn: requestLog.length - requestsAtReturn,
    successfulRequests, expectedSuccessRequests, peakConcurrency, activeAtReturn,
    cacheWrites, responseBytes, mockElapsedMs: Number(returnedAfterMs.toFixed(3)),
    mockSettledMs: Number(settledAfterMs.toFixed(3)),
    heapDeltaBytes: after.heapUsed - before.heapUsed, highestSampledHeapGrowthBytes: highestSampledHeap - before.heapUsed,
    rssDeltaBytes: after.rss - before.rss, highestSampledRssGrowthBytes: highestSampledRss - before.rss,
    mockedRepositoryMethodCalls: repoCalls, error,
  };
}
const rows = [];
for (const persons of [1, 10, 50, 100]) {
  for (const cases of [1, 10, 49, 50, 100]) rows.push(await scenario(persons, cases));
}
rows.push(await scenario(100, 100, { id: 'first-case-page', path: '/api/persons/person-0/analysis-cases?limit=50&offset=0' }));
rows.push(await scenario(100, 100, { id: 'second-case-page', path: '/api/persons/person-99/analysis-cases?limit=50&offset=50' }));
rows.push(await scenario(100, 100, { id: 'first-person-page', path: '/api/persons?limit=50&offset=0' }));
const report = {
  mode: 'SOURCE_BACKED_SYNTHETIC_MOCK', networkCalls: 0, databaseCalls: 0, mockLatencyMs,
  nodeVersion: process.version, gcAvailable: typeof global.gc === 'function', sourceHashes,
  limitations: [
    'Actual loader/mapper/service pagination functions run with explicit mock dependency injection.',
    'Time includes fixed synthetic timers, JSON conversion and local CPU; not production latency.',
    'No React render, browser layout, auth provider, real network, DB, query plan or production capacity measurement.',
    'Memory deltas/sampled peaks include module/transpile overhead and GC variability; fixture construction is excluded.',
    'Current runtime limits History case reads to four workers and stops new requests after failure/auth change; already in-flight reads can settle.',
  ], rows,
};
const target = resolve(root, 'experiments/performance/history.json');
assert.ok(target.startsWith(root + '\\') || target.startsWith(root + '/'));
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ scenarios: rows.length, sourceFiles: Object.keys(sourceHashes).length, target, maxRequests: Math.max(...rows.map((r) => r.requestCount)), maxConcurrency: Math.max(...rows.map((r) => r.peakConcurrency)) }));
