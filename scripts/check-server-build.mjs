import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 空の cwd と限定した環境で、実際の .env・資格情報を読み込ませません。
const cwd = mkdtempSync(join(tmpdir(), 'kigen404-build-check-'));
const env = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://build_check:synthetic@127.0.0.1:1/kigen404_build_check',
  SUPABASE_URL: 'https://build-check.invalid',
  SUPABASE_PUBLISHABLE_KEY: 'synthetic-build-check-key',
  GUEST_V1_ENABLED: 'false',
};
for (const key of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'TEMP', 'TMP']) {
  if (process.env[key]) env[key] = process.env[key];
}

try {
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', `
    import assert from 'node:assert/strict';
    import { once } from 'node:events';
    import { Socket } from 'node:net';

    let outboundAttempts = 0;
    function blockOutbound() {
      outboundAttempts += 1;
      throw new Error('External connections are forbidden in the build check');
    }
    Socket.prototype.connect = blockOutbound;
    globalThis.fetch = blockOutbound;

    const { PrismaClient } = await import(${JSON.stringify(new URL('../dist/backend/generated/prisma/client.js', import.meta.url).href)});
    assert.equal(typeof PrismaClient, 'function');
    const { createServerApp } = await import(${JSON.stringify(new URL('../dist/backend/server.js', import.meta.url).href)});
    const app = await createServerApp();
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    assert.equal(outboundAttempts, 0);
    console.log('Built Prisma Client import, server initialization and loopback listen: OK (outbound attempts: 0)');
  `], { cwd, env, encoding: 'utf8', timeout: 30_000, windowsHide: true });
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');
  if (result.error) throw result.error;
  process.exitCode = result.status === 0 ? 0 : 1;
} finally {
  // この検証で作った空ディレクトリだけを削除し、再帰削除はしません。
  rmdirSync(cwd);
}
