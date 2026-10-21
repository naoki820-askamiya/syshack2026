import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '../utils/index.js';
import { aiCurrentCaseSchema, aiPersonContextSchema } from '../ai/v2/input.schema.js';
import { validateAiOutput } from '../ai/v2/validation.js';
import { buildGuestRequest } from './provider.js';
import { validRuntime, type GuestRuntime } from './config.js';
import type { GuestBudget, GuestRepository, GuestRun, GuestProvider, GuestSession } from './types.js';

const inputV1 = z.object({ person: aiPersonContextSchema, currentCase: aiCurrentCaseSchema }).strict();
const submissionV1 = z.object({ intent: z.string().uuid(), input: inputV1 }).strict();
export const emptyGuestHistory = () => ({ personProfile: null, userPatternSummary: null,
  recentCaseSummaries: [], recentFeedbacks: [] });
export const guestError = (code: string, status: number, message: string) => new AppError({ code, status, message });
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export const csrfToken = (token: string) => createHmac('sha256', token).update('guest-v1-csrf').digest('hex');
export function checkCsrf(token: string, value: unknown): boolean {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value)) return false;
  return timingSafeEqual(Buffer.from(csrfToken(token)), Buffer.from(value));
}
const fingerprint = (token: string, value: unknown) => createHmac('sha256', token)
  .update('guest-canonical-input-v1\0').update(JSON.stringify(value)).digest('hex');

export function budgetReady(b: GuestBudget): boolean {
  try {
    return !b.stopped && b.maxCostMicros !== null && /^\d+$/u.test(b.maxCostMicros) && BigInt(b.maxCostMicros) > 0n &&
      [b.maxRequests, b.maxConcurrent, b.issuanceLimit, b.issueWindowSeconds, b.issueWindowLimit]
        .every(v => typeof v === 'number' && Number.isSafeInteger(v) && v > 0);
  } catch { return false; }
}

export function createGuestService(deps: { repository: GuestRepository; provider: GuestProvider;
  runtime: () => GuestRuntime | null; now?: () => Date }) {
  const repo = deps.repository;
  const now = deps.now ?? (() => new Date());
  function runtime() {
    const config = deps.runtime();
    if (!config || !validRuntime(config)) throw guestError('GUEST_DISABLED', 503, 'ゲスト体験は現在利用できません。通常のログインをご利用ください。');
    return config;
  }
  async function identity(token: string | undefined): Promise<GuestSession> {
    if (!token || !/^[A-Za-z0-9_-]{43}$/u.test(token)) throw guestError('GUEST_COOKIE_REQUIRED', 401, 'ゲストCookieを確認できません。Cookieが利用できる環境でお試しください。');
    const session = await repo.session(tokenHash(token));
    if (!session || (session.usedUntil ?? session.issuedExpiresAt).getTime() <= now().getTime()) {
      throw guestError('GUEST_EXPIRED', 410, 'ゲスト利用権の期限が切れています。');
    }
    return session;
  }
  function publicRun(run: GuestRun | null, session: GuestSession) {
    if (!run) return null;
    const unavailable = !!run.deletedAt || !!session.revokedAt || run.contentExpiresAt.getTime() <= now().getTime();
    let result: unknown = null;
    if (!unavailable && run.state === 'SUCCEEDED' && run.result) {
      try { result = validateAiOutput(run.result, emptyGuestHistory()); } catch { /* Never echo stored unsafe content. */ }
    }
    return { id: run.id, state: run.state, result, contentUnavailable: unavailable,
      canStartNewIntent: run.state === 'CANCELLED' && !session.revokedAt && !session.usedUntil &&
        session.issuedExpiresAt.getTime() > now().getTime() };
  }
  async function snapshot(token: string) {
    const session = await identity(token);
    const run = await repo.current(session.id);
    const config = deps.runtime();
    const p = config?.policy;
    return { csrfToken: csrfToken(token), session: {
      consented: !!session.consentedAt && (p ? session.consentVersion === p.consentVersion &&
        session.termsVersion === p.termsVersion && session.privacyVersion === p.privacyVersion : !!session.consentVersion),
      used: !!session.usedUntil || (!!run && run.state !== 'CANCELLED'),
    }, run: publicRun(run, session) };
  }
  async function finish(run: GuestRun, outcome: Parameters<GuestRepository['finish']>[2]) {
    // Retry the SAME DB outcome only; this function never calls the provider.
    try { await repo.finish(run.id, run.executor, outcome); }
    catch { await repo.finish(run.id, run.executor, outcome); }
  }
  return {
    async config() {
      const c = deps.runtime();
      if (!c || !validRuntime(c) || !budgetReady(await repo.budget())) return { enabled: false };
      return { enabled: true, termsVersion: c.policy.termsVersion, privacyVersion: c.policy.privacyVersion,
        consentVersion: c.policy.consentVersion, notice: c.notice };
    },
    identity, snapshot,
    async issue(existingToken?: string) {
      const c = runtime();
      if (!budgetReady(await repo.budget())) throw guestError('GUEST_DISABLED', 503, 'ゲスト体験の受付を停止しています。');
      if (existingToken) {
        await identity(existingToken);
        return { token: existingToken, maxAgeMs: null, response: await snapshot(existingToken) };
      }
      const token = randomBytes(32).toString('base64url');
      await repo.issue(tokenHash(token), new Date(now().getTime() + c.issueTtlMs));
      // Credential survives a full used period even if the dispatch response is lost.
      // Unused eligibility is still enforced by issuedExpiresAt; GET never slides this cookie.
      return { token, maxAgeMs: c.issueTtlMs + c.policy.usedTtlMs, response: await snapshot(token) };
    },
    async consent(token: string, body: unknown) {
      const c = runtime();
      const s = await identity(token);
      const parsed = z.object({ accepted: z.literal(true), termsVersion: z.literal(c.policy.termsVersion),
        privacyVersion: z.literal(c.policy.privacyVersion), consentVersion: z.literal(c.policy.consentVersion) }).strict().safeParse(body);
      if (!parsed.success) throw guestError('GUEST_CONSENT_REQUIRED', 400, '表示中のゲスト利用条件を確認してください。');
      await repo.consent(s.id, c.policy);
      return snapshot(token);
    },
    async analyze(token: string, body: unknown) {
      const session = await identity(token);
      const parsed = submissionV1.safeParse(body);
      if (!parsed.success) throw guestError('GUEST_INPUT_INVALID', 400, '入力内容を確認してください。');
      const data = parsed.data;
      const hash = fingerprint(token, data.input);
      // Read/replay precedes current configuration: a release change cannot regenerate a run.
      const existing = await repo.current(session.id, data.intent);
      if (existing && existing.intent === data.intent) {
        if (existing.fingerprint !== hash) throw guestError('GUEST_INTENT_CONFLICT', 409, '同じ送信キーで入力内容を変更できません。');
        return { run: publicRun(existing, session) };
      }
      const c = runtime();
      const input = { referenceContext: emptyGuestHistory(), untrustedUserInput: data.input };
      const request = buildGuestRequest(input, c.policy);
      if (!c.verifyTokenBound(request)) throw guestError('GUEST_CONFIG_INVALID', 503, '入力上限を安全に確認できないため分析を開始できません。');
      const executor = randomUUID();
      const reservation = await repo.reserve(session.id, data.intent, hash, input, c.policy, executor);
      if (!reservation.created) return { run: publicRun(reservation.run, session) };
      let authorized: GuestRun | null;
      try { authorized = await repo.authorize(reservation.run.id, executor); }
      catch {
        // A commit may have succeeded without ACK. NEVER infer permission to send.
        await finish(reservation.run, { terminal: false }).catch(() => {});
        await repo.cancel(reservation.run.id, executor).catch(() => {});
        throw guestError('GUEST_STATE_UNCERTAIN', 503, '開始状態を確認できません。再送せず結果を確認してください。');
      }
      if (!authorized) {
        await repo.cancel(reservation.run.id, executor);
        return { run: (await snapshot(token)).run };
      }
      let outcome;
      try { outcome = await deps.provider.generate(authorized.input, authorized.policy); }
      catch { outcome = { terminal: false }; }
      // Guard injected/provider boundaries too; only safe data reaches persistence.
      if (outcome.result !== undefined) {
        try { outcome.result = validateAiOutput(outcome.result, emptyGuestHistory()); }
        catch { outcome = { terminal: outcome.terminal, usage: outcome.usage }; }
      }
      await finish(authorized, outcome);
      return { run: (await snapshot(token)).run };
    },
    async result(token: string) { return { run: (await snapshot(token)).run }; },
    async erase(token: string) {
      const session = await identity(token);
      await repo.erase(session.id);
      return { run: (await snapshot(token)).run };
    },
  };
}
