import assert from 'node:assert/strict';
import test from 'node:test';
import { assertDisposableUrl } from './safety.mjs';

const id = 'a123456789abcdef';
const safe = `postgresql://postgres:${'a'.repeat(32)}@127.0.0.1:54321/kigen404_integration_${id}`;
test('only the runner-created loopback database is accepted', () => {
  assert.equal(assertDisposableUrl(safe, id).hostname, '127.0.0.1');
  for (const url of [safe.replace('127.0.0.1', 'db.supabase.co'), safe.replace('127.0.0.1', 'localhost'),
    safe.replace(`kigen404_integration_${id}`, 'postgres'), `${safe}?sslmode=require`,
    safe.replace(':54321/', ':0/'), safe.replace('postgres:', 'application:')]) {
    assert.throws(() => assertDisposableUrl(url, id));
  }
  assert.throws(() => assertDisposableUrl(safe, undefined));
  assert.throws(() => assertDisposableUrl(safe, 'b123456789abcdef'));
});
