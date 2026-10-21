import { Router, type Request } from 'express';
import { prisma } from '../prisma/client.js';
import { asyncHandler } from '../v17/http.js';
import { readGuestOrigin, readGuestRuntime, type GuestRuntime } from './config.js';
import { createGuestRepository } from './repository.js';
import { createGuestProvider } from './provider.js';
import { checkCsrf, createGuestService, guestError } from './service.js';
import type { GuestProvider, GuestRepository } from './types.js';

const productionRepository = createGuestRepository(prisma);
let startupBlocked = true;
// A new process cannot prove another process's dispatch was never sent. Stop
// conservatively on abandoned authorization; never resend or release its budget.
export async function initializeGuestStartup(): Promise<void> {
  if (!readGuestRuntime()) { startupBlocked = true; return; }
  try { await productionRepository.recover(); startupBlocked = false; }
  catch { startupBlocked = true; } // Guest failure must not take normal user routes down.
}

export function createGuestRouter(options: { repository?: GuestRepository; provider?: GuestProvider;
  runtime?: () => GuestRuntime | null; origin?: () => string | undefined } = {}) {
  const runtime = options.runtime ?? (() => startupBlocked ? null : readGuestRuntime());
  const service = createGuestService({ repository: options.repository ?? productionRepository,
    provider: options.provider ?? createGuestProvider(), runtime });
  const router = Router();
  const originFor = (req: Request) => options.origin?.() ?? runtime()?.origin ?? readGuestOrigin() ?? `${req.protocol}://${req.get('host')}`;
  const cookieName = (req: Request) => originFor(req).startsWith('https:') ? '__Host-kigen404_guest_v1' : 'kigen404_guest_v1_local';
  function token(req: Request): string | undefined {
    const values = (req.get('cookie') ?? '').split(';').map(v => v.trim()).filter(v => v.startsWith(`${cookieName(req)}=`));
    if (values.length > 1) throw guestError('GUEST_COOKIE_REQUIRED', 401, 'ゲストCookieを確認できません。');
    return values[0]?.slice(cookieName(req).length + 1);
  }
  router.use((req, res, next) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.vary('Origin'); res.vary('Cookie');
    // Do not treat a normal bearer identity as a guest or attach it to guest accounting.
    if (req.get('authorization')) return next(guestError('GUEST_IDENTITY_CONFLICT', 400, 'ゲスト用の通信を使用してください。'));
    const origin = req.get('origin');
    const write = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    if ((origin && origin !== originFor(req)) || (write && !origin)) {
      return next(guestError('GUEST_ORIGIN_REJECTED', 403, '同じサイトから操作してください。'));
    }
    if (write && !req.is('application/json')) return next(guestError('GUEST_CONTENT_TYPE', 415, 'JSON形式で送信してください。'));
    next();
  });
  router.get('/config', asyncHandler(async (_req, res) => { res.json(await service.config()); }));
  router.post('/session', asyncHandler(async (req, res) => {
    const issued = await service.issue(token(req));
    if (issued.maxAgeMs !== null) res.cookie(cookieName(req), issued.token, { httpOnly: true,
      secure: originFor(req).startsWith('https:'), sameSite: 'strict', path: '/', maxAge: issued.maxAgeMs });
    res.status(201).json(issued.response);
  }));
  router.get('/session', asyncHandler(async (req, res) => {
    const raw = token(req);
    if (!raw) throw guestError('GUEST_NOT_ISSUED', 404, 'ゲスト利用権はまだ発行していません。');
    await service.identity(raw);
    res.json(await service.snapshot(raw!));
  }));
  // Issuance has no ambient credential yet; every subsequent write needs CSRF AND owner cookie.
  router.use((req, _res, next) => {
    void Promise.resolve().then(async () => {
      const raw = token(req); await service.identity(raw);
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !checkCsrf(raw!, req.get('x-guest-csrf'))) {
        throw guestError('GUEST_CSRF_REJECTED', 403, 'ゲスト画面を開き直して操作してください。');
      }
      next();
    }).catch(next);
  });
  router.post('/consent', asyncHandler(async (req, res) => { res.json(await service.consent(token(req)!, req.body)); }));
  router.post('/analyze', asyncHandler(async (req, res) => { res.json(await service.analyze(token(req)!, req.body)); }));
  router.get('/result', asyncHandler(async (req, res) => { res.json(await service.result(token(req)!)); }));
  router.delete('/content', asyncHandler(async (req, res) => { res.json(await service.erase(token(req)!)); }));
  return router;
}
export default createGuestRouter();
