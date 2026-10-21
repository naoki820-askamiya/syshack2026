// Local-only browser fixture. Synthetic Auth endpoints; no provider/DB/AI access.
import { build, createServer, preview } from 'vite';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const port = 4178;
const origin = `http://127.0.0.1:${port}`;
process.env.VITE_SUPABASE_URL = origin;
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'synthetic-public-key';
process.env.VITE_PASSWORD_RECOVERY_ENABLED = 'true';
const counts = { recover: 0, verify: 0, update: 0, logout: 0 };
const used = new Set();
const user = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-10-19T00:00:00Z' };
const access = [Buffer.from('{"alg":"HS256"}').toString('base64url'), Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'), 'synthetic'].join('.');
const fixturePlugin = {
  name: 'synthetic-recovery-only',
  transformIndexHtml(html) {
    return html.replace('<body>', '<body><aside role="note" style="position:fixed;top:0;left:0;right:0;z-index:9999;padding:8px 12px;background:#fff3cd;color:#6a4500;font:13px/1.5 sans-serif;text-align:center">ローカルデモ — メール送信・実アカウントの変更は行いません。</aside>');
  },
  configureServer(vite) {
    vite.middlewares.use(async (req, res, next) => {
      const path = new URL(req.url, origin).pathname;
      if (path === '/__recovery-preview') {
        res.statusCode = 302;
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Location', '/reset-password#token_hash=synthetic-valid-recovery-preview-' + randomUUID());
        res.end(); return;
      }
      if (path === '/__recovery-fixture') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(counts)); return; }
      if (!path.startsWith('/auth/v1/')) { next(); return; }
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('X-Supabase-Api-Version', '2024-01-01');
      let raw = ''; for await (const chunk of req) raw += chunk;
      let body = {}; try { body = JSON.parse(raw || '{}'); } catch { res.statusCode = 400; res.end('{}'); return; }
      if (path === '/auth/v1/recover') { counts.recover++; res.end('{}'); return; }
      if (path === '/auth/v1/verify') {
        counts.verify++;
        if (body.type !== 'recovery' || !String(body.token_hash).startsWith('synthetic-valid-recovery-') || used.has(body.token_hash)) {
          res.statusCode = 403; res.end(JSON.stringify({ code: 'otp_expired', message: 'Synthetic invalid code' })); return;
        }
        used.add(body.token_hash);
        res.end(JSON.stringify({ user, access_token: access, refresh_token: 'synthetic-refresh', expires_in: 3600, token_type: 'bearer' })); return;
      }
      if (path === '/auth/v1/user' && req.method === 'PUT') {
        counts.update++;
        if (String(body.password).includes('weak')) { res.statusCode = 422; res.end(JSON.stringify({ code: 'weak_password', message: 'Synthetic policy' })); return; }
        res.end(JSON.stringify({ user })); return;
      }
      if (path === '/auth/v1/logout') { counts.logout++; res.end('{}'); return; }
      res.statusCode = 403; res.end(JSON.stringify({ code: 'synthetic_denied', message: 'Not a fixture endpoint' }));
    });
  },
};
fixturePlugin.configurePreviewServer = fixturePlugin.configureServer;
if (process.argv.includes('--static')) {
  // A built preview avoids dependency compilation delays after a PC restart.
  // Outputs stay outside the repository and no directory is recursively cleared.
  const outDir = fileURLToPath(new URL('../../kigen404-preview-static/', import.meta.url));
  await build({ plugins: [fixturePlugin], build: { outDir, emptyOutDir: false } });
  await preview({ plugins: [fixturePlugin], build: { outDir }, preview: { host: '127.0.0.1', port, strictPort: true } });
} else {
  const server = await createServer({ server: { host: '127.0.0.1', port, strictPort: true }, plugins: [fixturePlugin] });
  await server.listen();
}
console.log(`Synthetic password-recovery browser fixture: ${origin}`);
