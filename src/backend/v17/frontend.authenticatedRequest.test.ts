import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchAuthenticated, readAuthenticatedJson } from './frontend.authenticatedRequest.candidate.js';
import { captureAuthBoundary, setAuthenticatedUser } from '../../app/utils/authBoundary.js';

const session = (id = 'A') => Promise.resolve({ data: { session: { user: { id }, access_token: 'synthetic-token' } } });
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};

test('current authenticated request retains its token and returns JSON', async () => {
  setAuthenticatedUser('A', { newSession: true });
  const boundary = captureAuthBoundary();
  let calls = 0;
  const response = await fetchAuthenticated(boundary, session, async (token) => {
    calls += 1;
    assert.equal(token, 'synthetic-token');
    return Response.json({ id: 'A-case' });
  });
  assert.equal(calls, 1);
  assert.deepEqual(await readAuthenticatedJson(boundary, response), { id: 'A-case' });
});

test('stale boundary or mismatched session never sends a request', async () => {
  setAuthenticatedUser('A', { newSession: true });
  const old = captureAuthBoundary();
  setAuthenticatedUser('B');
  let calls = 0;
  const send = async () => { calls += 1; return Response.json({}); };
  await assert.rejects(fetchAuthenticated(old, session, send), /ログイン状態/);
  await assert.rejects(fetchAuthenticated(captureAuthBoundary(), session, send), /ログイン状態/);
  assert.equal(calls, 0);
});

test('identity change during session lookup never sends the old request', async () => {
  setAuthenticatedUser('A', { newSession: true });
  const pending = deferred<Awaited<ReturnType<typeof session>>>();
  let calls = 0;
  const request = fetchAuthenticated(captureAuthBoundary(), () => pending.promise, async () => {
    calls += 1; return Response.json({});
  });
  setAuthenticatedUser('B');
  pending.resolve(await session());
  await assert.rejects(request, /ログイン状態/);
  assert.equal(calls, 0);
});

test('delayed A network response is rejected after B logs in', async () => {
  setAuthenticatedUser('A', { newSession: true });
  const pending = deferred<Response>();
  let started!: () => void;
  const sent = new Promise<void>((resolve) => { started = resolve; });
  const request = fetchAuthenticated(captureAuthBoundary(), session, async () => { started(); return pending.promise; });
  await sent;
  setAuthenticatedUser('B');
  pending.resolve(Response.json({ private: 'A' }));
  await assert.rejects(request, /ログイン状態/);
});

test('body parsing completion after expiry and same-user re-login is rejected', async () => {
  setAuthenticatedUser('A', { newSession: true });
  const pending = deferred<unknown>();
  const response = { json: () => pending.promise } as Response;
  const body = readAuthenticatedJson(captureAuthBoundary(), response);
  setAuthenticatedUser(null);
  setAuthenticatedUser('A', { newSession: true });
  pending.resolve({ private: 'old A' });
  await assert.rejects(body, /ログイン状態/);
});
