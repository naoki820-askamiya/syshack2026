import assert from 'node:assert/strict';
import test from 'node:test';
import { createBrowserAuthClient, type BrowserSession } from '../../app/auth/cookieClient.js';
import { createApiClient } from '../../app/api/clientRequest.js';
import { setAuthenticatedUser } from '../../app/utils/authBoundary.js';

const session = (id = 'a'.repeat(32), userId = 'A'): BrowserSession => ({ id,
  user: { id: userId, email: userId + '@example.invalid' }, expiresAt: Date.now() / 1000 + 3600 });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }

test('reload restores identity through cookies and never receives or sends a Supabase token', async () => {
  const requests: RequestInit[] = [];
  let loggedIn = false;
  const send: typeof fetch = async (input, init) => {
    requests.push(init!);
    const path = String(input);
    if (path.endsWith('/login')) loggedIn = true;
    if (path.endsWith('/logout')) loggedIn = false;
    return Response.json({ session: loggedIn ? session() : null });
  };
  const first = createBrowserAuthClient({ send, serverUrl: '' });
  assert.equal((await first.auth.signInWithPassword({ email: 'A@example.invalid', password: 'synthetic' })).error, null);
  const reloaded = createBrowserAuthClient({ send, serverUrl: '' });
  const restored = await reloaded.auth.getSession();
  assert.equal(restored.data.session?.user.id, 'A');
  assert.doesNotMatch(JSON.stringify(restored), /access_token|refresh_token/);
  assert.equal((await reloaded.auth.signOut()).error, null);
  const afterLogout = createBrowserAuthClient({ send, serverUrl: '' });
  assert.equal((await afterLogout.auth.getSession()).data.session, null);
  for (const request of requests) {
    assert.equal(request.credentials, 'include');
    assert.equal(new Headers(request.headers).get('x-kigen-csrf'), '1');
    assert.equal(new Headers(request.headers).has('authorization'), false);
  }
});

test('parallel session checks coalesce and auth mutations execute in sequence', async () => {
  const pending = deferred<Response>(); const paths: string[] = [];
  const client = createBrowserAuthClient({ serverUrl: '', send: async input => {
    paths.push(String(input));
    return paths.length === 1 ? pending.promise : Response.json({ session: session() });
  } });
  const reads = [client.auth.getSession(), client.auth.getSession()];
  await new Promise<void>(done => setImmediate(done));
  assert.equal(paths.length, 1);
  pending.resolve(Response.json({ session: session() }));
  await Promise.all(reads);
  assert.equal(paths.length, 1);
});

test('cross-tab invalidation clears identity synchronously and rejects an old pending restore', async () => {
  const pending = deferred<Response>(); const observed: unknown[] = [];
  const client = createBrowserAuthClient({ serverUrl: '', send: async () => pending.promise });
  client.auth.onAuthStateChange((_event, value) => observed.push(value));
  const read = client.auth.getSession();
  await new Promise<void>(done => setImmediate(done));
  client.invalidate();
  assert.deepEqual(observed, [null]);
  pending.resolve(Response.json({ session: session() }));
  assert.ok((await read).error);
  assert.deepEqual(observed, [null]);
});

test('a stale tab cannot log out a newer login and observes its new binding', async () => {
  let current = session(); const paths: string[] = [];
  const client = createBrowserAuthClient({ serverUrl: '', send: async input => { paths.push(String(input)); return Response.json({ session: current }); } });
  await client.auth.getSession(); current = session('b'.repeat(32), 'B');
  assert.ok((await client.auth.signOut()).error);
  assert.equal(paths.some(path => path.endsWith('/logout')), false);
  assert.equal((await client.auth.getSession()).data.session?.user.id, 'B');
});

test('protected cookie requests carry their original login binding and preserve auth race guards', async () => {
  setAuthenticatedUser('A'); let sent: RequestInit | undefined;
  const client = createApiClient({ getSession: async () => ({ data: { session: session() } }),
    send: async (_path, init) => { sent = init; return Response.json({ ok: true }); } });
  assert.deepEqual(await client.fetchApiJson('/api/persons', { method: 'POST', body: '{}' }), { ok: true });
  assert.equal(sent?.credentials, 'include');
  assert.equal(new Headers(sent?.headers).get('x-kigen-session'), 'a'.repeat(32));
  assert.equal(new Headers(sent?.headers).get('x-kigen-csrf'), '1');
  assert.equal(new Headers(sent?.headers).has('authorization'), false);
  const switched = createApiClient({ getSession: async () => { setAuthenticatedUser('B'); return { data: { session: session('b'.repeat(32), 'B') } }; },
    send: async () => { throw new Error('must not dispatch stale intent'); } });
  setAuthenticatedUser('A');
  await assert.rejects(switched.fetchApiJson('/api/persons', { method: 'POST', body: '{}' }), { name: 'StaleAuthWriteIntentError' });
});

test('one-time callback exchanges only its code and does not repeat it on later lookups', async () => {
  const paths: string[] = [];
  const client = createBrowserAuthClient({ serverUrl: '', takeCallbackCode: () => 'synthetic-code', send: async (input, init) => {
    paths.push(String(input)); assert.deepEqual(JSON.parse(String(init?.body)), { code: 'synthetic-code' });
    return Response.json({ session: session() });
  } });
  assert.equal((await client.auth.getSession()).data.session?.user.id, 'A');
  await client.auth.getSession(); assert.deepEqual(paths, ['/api/auth/callback']);
});

test('failed remote revalidation publishes a recoverable error instead of leaving the UI pending', async () => {
  const observed: string[] = [];
  const client = createBrowserAuthClient({ serverUrl: '', send: async () => { throw new Error('Synthetic offline'); } });
  client.auth.onAuthStateChange(event => observed.push(event));
  client.invalidate();
  assert.ok((await client.revalidate()).error);
  assert.deepEqual(observed, ['SESSION_PENDING', 'SESSION_ERROR']);
});


test('a queued logout keeps the original user intent when a newer login completes first', async () => {
  let current = session(); const paths: string[] = []; const pending = deferred<Response>(); const started = deferred<void>();
  const client = createBrowserAuthClient({serverUrl:'', send: async input => {
    const path=String(input); paths.push(path);
    if(path.endsWith('/login')) { started.resolve(); const result=await pending.promise; current=session('b'.repeat(32),'B'); return result; }
    return Response.json({session:current});
  }});
  await client.auth.getSession();
  const login=client.auth.signInWithPassword({email:'B@example.invalid',password:'synthetic'});
  await started.promise; const logout=client.auth.signOut();
  pending.resolve(Response.json({session:session('b'.repeat(32),'B')}));
  assert.equal((await login).error,null); assert.ok((await logout).error);
  assert.equal(paths.some(path=>path.endsWith('/logout')),false);
  assert.equal((await client.auth.getSession()).data.session?.user.id,'B');
});
