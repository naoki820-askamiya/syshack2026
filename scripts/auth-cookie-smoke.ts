// Local, synthetic browser fixture. Never deploy or run against real accounts.
if (process.env.KIGEN_AUTH_FIXTURE !== '1') throw new Error('KIGEN_AUTH_FIXTURE=1 is required');
const safeEnv = { NODE_ENV: 'development', AUTH_COOKIE_SECRET: 'a1'.repeat(32), AUTH_COOKIE_SECURE: 'false',
  SUPABASE_URL: 'https://synthetic.invalid', SUPABASE_PUBLISHABLE_KEY: 'synthetic-key',
  DATABASE_URL: 'postgresql://synthetic:synthetic@127.0.0.1:1/offline', VITE_SERVER_URL: '',
  ALLOWED_ORIGINS: 'http://127.0.0.1:5179' };
Object.assign(process.env, safeEnv);
const [{ default: express }, { createServer }, { createServerApp }, { browserAuthProvider }, { supabaseAuth },
  { requireAuth }, { browserMutation }, { readCookieSession, writeSession }, { prisma }] = await Promise.all([
  import('express'), import('vite'), import('../src/backend/server.js'), import('../src/backend/auth/provider.js'),
  import('../src/backend/auth/supabase.js'), import('../src/backend/middlewares/requireAuth.js'),
  import('../src/backend/auth/browserSecurity.js'), import('../src/backend/auth/cookies.js'), import('../src/backend/prisma/client.js'),
]);
Object.assign(process.env, safeEnv);
const revoked = new Set<string>(); let refreshes = 0; let tokenSequence = 0;
function session(id: string) {
  return { access_token: `synthetic:${id}:${++tokenSequence}`, refresh_token: `synthetic-refresh:${id}`,
    expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer',
    user: { id, email: id + '@example.invalid', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-11-16T00:00:00Z' } };
}
browserAuthProvider.signIn = async email => ({ data: { session: session(email.startsWith('B') ? 'B' : 'A'), user: null }, error: null }) as never;
browserAuthProvider.refresh = async token => { refreshes++; return { data: { session: session(token.split(':')[1]), user: null }, error: null } as never; };
browserAuthProvider.signOut = async token => { revoked.add(token); return { data: null, error: null }; };
browserAuthProvider.signUp = async () => { throw new Error('Synthetic fixture does not send registration emails'); };
browserAuthProvider.resend = async () => { throw new Error('Synthetic fixture does not send emails'); };
browserAuthProvider.exchange = async () => { throw new Error('Synthetic fixture has no real callback'); };
supabaseAuth.auth.getUser = async token => ({ data: { user: token && !revoked.has(token) ? session(token.split(':')[1]).user : null }, error: null }) as never;
const app = express();
app.use(express.json());
// Empty history fixtures bypass all business DB access but retain real auth.
app.get('/api/persons', requireAuth, (_req, res) => res.json({ persons: [], pagination: { hasMore: false } }));
app.post('/api/__fixture/expire', browserMutation, requireAuth, (req, res) => {
  const current = readCookieSession(req.headers.cookie)!;
  writeSession(res, { ...current, expiresAt: Math.floor(Date.now() / 1000) - 1 }, false);
  res.json({ ok: true });
});
app.get('/api/__fixture/status', (_req, res) => res.json({ refreshes }));
app.use(await createServerApp());
const api = app.listen(3311, '127.0.0.1');
await new Promise<void>((resolve, reject) => { api.once('listening', resolve); api.once('error', reject); });
const vite = await createServer({ envDir: false, define: { 'import.meta.env.VITE_SERVER_URL': JSON.stringify('') },
  server: { host: '127.0.0.1', port: 5179, strictPort: true, proxy: { '/api': { target: 'http://127.0.0.1:3311', changeOrigin: false } } } });
await vite.listen();
console.log('Synthetic Cookie fixture ready at http://127.0.0.1:5179 (no real Auth/DB/AI)');
async function close() { await vite.close(); await new Promise<void>(done => api.close(() => done())); await prisma.$disconnect(); process.exit(0); }
process.on('SIGINT', () => { void close(); });
process.stdin.on('data', input => { if (String(input).trim() === 'quit') void close(); });
