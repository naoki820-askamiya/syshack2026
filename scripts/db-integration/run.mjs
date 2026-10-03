import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { assertDisposableUrl } from './safety.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const runId = randomBytes(8).toString('hex');
const password = randomBytes(16).toString('hex');
const name = `kigen404-integration-${runId}`;
const database = `kigen404_integration_${runId}`;
const image = 'postgres:17-bookworm';
let containerId;
let workdir;
let child;

function command(executable, args, options = {}) {
  return new Promise((resolveCommand, reject) => {
    const processChild = spawn(executable, args, { shell: false, windowsHide: true,
      timeout: 120_000, ...options });
    child = processChild;
    let stdout = '';
    let stderr = '';
    processChild.stdout?.on('data', chunk => { stdout += chunk; });
    processChild.stderr?.on('data', chunk => { stderr += chunk; });
    processChild.once('error', reject);
    processChild.once('close', code => code === 0 ? resolveCommand(stdout.trim())
      : reject(new Error(`${executable} failed (${code}): ${stderr.replaceAll(password, '[redacted]')}`)));
  });
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => { child?.kill(); });
}

try {
  const cachedId = await command('docker', ['image', 'ls', '--filter', `reference=${image}`, '--format', '{{.ID}}']);
  if (!/^[a-f0-9]{12,64}$/.test(cachedId)) throw new Error('Required cached PostgreSQL image is unavailable.');
  const imageId = await command('docker', ['image', 'inspect', '--format', '{{.Id}}', cachedId]);
  if (!/^sha256:[a-f0-9]{64}$/.test(imageId)) throw new Error('Unexpected cached image identity.');
  containerId = await command('docker', ['run', '--detach', '--rm', '--pull', 'never',
    '--name', name, '--label', `kigen404.disposable-run=${runId}`,
    '--publish', '127.0.0.1::5432', '--tmpfs', '/var/lib/postgresql/data:rw',
    '--env', `POSTGRES_PASSWORD=${password}`, '--env', `POSTGRES_DB=${database}`, imageId]);
  if (!/^[a-f0-9]{64}$/.test(containerId)) throw new Error('Unexpected container identity.');
  const ports = JSON.parse(await command('docker', ['inspect', '--format',
    '{{json .NetworkSettings.Ports}}', containerId]));
  const bindings = ports['5432/tcp'];
  if (bindings?.length !== 1 || bindings[0].HostIp !== '127.0.0.1') {
    throw new Error('Refusing a non-loopback database port.');
  }
  const databaseUrl = `postgresql://postgres:${password}@127.0.0.1:${bindings[0].HostPort}/${database}`;
  assertDisposableUrl(databaseUrl, runId);
  const deadline = Date.now() + 30_000;
  let ready = false;
  while (Date.now() < deadline) {
    const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 1000 });
    try { await client.connect(); await client.query('SELECT 1'); ready = true; break; }
    catch { await new Promise(resolveWait => setTimeout(resolveWait, 250)); }
    finally { await client.end().catch(() => {}); }
  }
  if (!ready) throw new Error('Disposable PostgreSQL did not become ready within 30 seconds.');
  workdir = await mkdtemp(resolve(tmpdir(), 'kigen404-db-integration-'));
  const env = { ...process.env, NODE_ENV: 'test', DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl,
    DB_INTEGRATION_DATABASE_URL: databaseUrl, KIGEN404_DISPOSABLE_RUN_ID: runId,
    SUPABASE_URL: 'https://test.invalid', SUPABASE_PUBLISHABLE_KEY: 'synthetic-test-key' };
  delete env.OPENAI_API_KEY;
  delete env.ALLOW_PAID_MODEL_BENCHMARK;
  console.log(`Disposable PostgreSQL: ${image}; loopback; tmpfs; unique test database. No .env loaded.`);
  await command(process.execPath, [resolve(root, 'node_modules/tsx/dist/cli.mjs'),
    '--test', resolve(root, 'scripts/db-integration/integration.test.ts')],
  { cwd: workdir, env, stdio: 'inherit' });
} catch (error) {
  console.error(error.message.replaceAll(password, '[redacted]'));
  process.exitCode = 1;
} finally {
  if (containerId) {
    const label = await command('docker', ['inspect', '--format',
      '{{index .Config.Labels "kigen404.disposable-run"}}', containerId]).catch(() => null);
    if (label === runId) {
      await command('docker', ['rm', '--force', containerId]);
      console.log('Disposable container removed; tmpfs data discarded.');
    } else {
      console.error('Cleanup identity check failed; refusing to remove another container.');
      process.exitCode = 1;
    }
  }
  if (workdir) {
    const cleanupPath = resolve(workdir);
    if (dirname(cleanupPath) !== resolve(tmpdir()) || !basename(cleanupPath).startsWith('kigen404-db-integration-')) {
      throw new Error('Refusing cleanup outside the runner temporary directory.');
    }
    await rm(cleanupPath, { recursive: true });
  }
}

