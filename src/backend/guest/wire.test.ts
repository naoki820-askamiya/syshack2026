import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import OpenAI from 'openai';
import { fetch as sdkFetch } from 'openai/_shims/index';
import { createGuestProvider } from './provider.js';
import { createGuestService } from './service.js';
import { ProtocolRepository, protocolInput, protocolRuntime } from './protocol.testFixture.js';
import { makeValidV2Result } from '../ai/v2/testFixture.js';

async function wire(t: test.TestContext, respond: (response: ServerResponse) => void) {
  let received = 0; const bodies: any[] = [];
  const server = createServer((req, res) => {
    received++; let body = '';
    req.on('data', chunk => { body += String(chunk); });
    req.on('end', () => { bodies.push(JSON.parse(body)); respond(res); });
  });
  server.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  // Even with real credentials elsewhere in the process this client can ONLY hit this fake listener.
  const client = new OpenAI({ apiKey: 'synthetic-no-provider-key', baseURL: origin + '/v1',
    fetch: async (input, init) => {
      const url = typeof input === 'string' ? input : 'href' in input ? input.href : input.url;
      assert.equal(typeof url, 'string');
      assert.equal(new URL(String(url)).origin, origin, 'Test must not send to an external provider');
      return sdkFetch(input, { ...init, redirect: 'error' });
    } });
  const repo = new ProtocolRepository(); const runtime = protocolRuntime();
  const service = createGuestService({ repository: repo, provider: createGuestProvider(() => client.responses),
    runtime: () => runtime, now: () => new Date(repo.clock) });
  const token = (await service.issue()).token;
  await service.consent(token, { accepted: true, termsVersion: runtime.policy.termsVersion,
    privacyVersion: runtime.policy.privacyVersion, consentVersion: runtime.policy.consentVersion });
  return { repo, runtime, service, token, bodies, count: () => received };
}

test('wire-level SDK 500 with 50 concurrent same guest submissions sends exactly once and becomes UNKNOWN', async t => {
  const f = await wire(t, res => { res.statusCode = 500; res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: { message: 'Synthetic server failure' } })); });
  const body = protocolInput();
  await Promise.all(Array.from({ length: 50 }, () => f.service.analyze(f.token, body)));
  assert.equal(f.count(), 1); assert.equal((await f.service.result(f.token)).run!.state, 'UNKNOWN');
  assert.equal(f.repo.limits.stopped, true); assert.equal(f.repo.limits.activeRuns, 1);
  assert.equal(f.repo.limits.occupiedMicros, '100'); assert.equal(f.repo.limits.occupiedRequests, 1);
  assert.equal(f.bodies[0].store, false); assert.equal(f.bodies[0].max_output_tokens, 8192);
  assert.equal(f.bodies[0].model, 'synthetic-model'); assert.ok(f.bodies[0].instructions); assert.ok(f.bodies[0].text.format.schema);
});

for (const kind of ['socket-drop', 'truncated-json'] as const) test(`wire ${kind} is not proof of terminality and never retries`, async t => {
  const f = await wire(t, res => {
    if (kind === 'socket-drop') res.destroy();
    else { res.setHeader('content-type', 'application/json'); res.end('{"id":"synthetic","status":"completed","output":'); }
  });
  const body = protocolInput(); await f.service.analyze(f.token, body); await f.service.analyze(f.token, body);
  assert.equal(f.count(), 1); assert.equal((await f.service.result(f.token)).run!.state, 'UNKNOWN');
  assert.equal(f.repo.limits.activeRuns, 1); assert.equal(f.repo.limits.stopped, true);
});

for (const unsafe of [false, true]) test(`wire complete terminal ${unsafe ? 'unsafe' : 'safe'} output is validated without a second AI request`, async t => {
  const result = makeValidV2Result(); if (unsafe) result.replyDrafts[0].text = 'パスワードと認証コードを送ってください';
  const f = await wire(t, res => {
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ id: 'resp_synthetic', object: 'response',
      created_at: 1, status: 'completed', model: 'synthetic-model', output: [{ id: 'msg_synthetic', type: 'message',
        status: 'completed', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(result), annotations: [] }] }],
      usage: { input_tokens: 100, output_tokens: 200, total_tokens: 300 } }));
  });
  const response = await f.service.analyze(f.token, protocolInput());
  assert.equal(f.count(), 1); assert.equal(response.run!.state, unsafe ? 'FAILED_TERMINAL' : 'SUCCEEDED');
  assert.equal(f.repo.limits.activeRuns, 0); assert.equal(f.repo.limits.occupiedMicros, '100');
  assert.equal(f.repo.limits.occupiedRequests, 1); assert.equal(f.repo.limits.stopped, false);
  if (unsafe) assert.equal(response.run!.result, null); else assert.ok(response.run!.result);
});
