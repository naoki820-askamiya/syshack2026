import { randomUUID } from 'node:crypto';
import type { GuestBudget, GuestPolicy, GuestRepository, GuestRun, GuestSession } from './types.js';
import type { GuestRuntime } from './config.js';
import { guestError } from './service.js';

// Protocol fixture ONLY. It exercises the real service, not PostgreSQL atomicity.
export class ProtocolRepository implements GuestRepository {
  clock = new Date('2026-10-21T00:00:00.000Z');
  sessions = new Map<string, GuestSession>();
  runs = new Map<string, GuestRun>();
  receipts = new Map<string, { authorized: boolean; cancelled: boolean; released: boolean }>();
  limits: GuestBudget = { stopped: false, maxCostMicros: '1000000', maxRequests: 100,
    maxConcurrent: 100, issuanceLimit: 1000, issueWindowSeconds: 60, issueWindowLimit: 1000,
    occupiedMicros: '0', occupiedRequests: 0, activeRuns: 0 };
  budgetReads = 0;
  private tail: Promise<unknown> = Promise.resolve();
  private serial<T>(fn: () => T | Promise<T>): Promise<T> {
    const current = this.tail.then(fn);
    this.tail = current.catch(() => {});
    return current;
  }
  async budget() { this.budgetReads++; return structuredClone(this.limits); }
  async session(hash: string) { return structuredClone([...this.sessions.values()].find(s => s.tokenHash === hash) ?? null); }
  private owned(id: string): GuestSession {
    const s = this.sessions.get(id);
    if (!s) throw guestError('GUEST_REQUIRED', 401, 'Synthetic missing session');
    return s;
  }
  private open() {
    if (this.limits.stopped || !this.limits.maxCostMicros || BigInt(this.limits.maxCostMicros) <= 0n ||
      !this.limits.maxRequests || !this.limits.maxConcurrent || !this.limits.issuanceLimit ||
      !this.limits.issueWindowSeconds || !this.limits.issueWindowLimit) {
      throw guestError('GUEST_UNAVAILABLE', 503, 'Synthetic stopped budget');
    }
  }
  issue(hash: string, expiresAt: Date) { return this.serial(() => {
    this.open();
    if (this.sessions.size >= Math.min(this.limits.issuanceLimit!, this.limits.issueWindowLimit!)) {
      throw guestError('GUEST_ISSUE_LIMIT', 429, 'Synthetic issue limit');
    }
    const s: GuestSession = { id: randomUUID(), tokenHash: hash, issuedExpiresAt: expiresAt,
      usedUntil: null, revokedAt: null, consentVersion: null, termsVersion: null, privacyVersion: null, consentedAt: null };
    this.sessions.set(s.id, s); return structuredClone(s);
  }); }
  consent(id: string, p: GuestPolicy) { return this.serial(() => {
    const s = this.owned(id);
    if (s.revokedAt || s.usedUntil || s.issuedExpiresAt <= this.clock) throw guestError('GUEST_USED', 409, 'Synthetic used');
    s.consentVersion = p.consentVersion; s.termsVersion = p.termsVersion; s.privacyVersion = p.privacyVersion;
    s.consentedAt ??= new Date(this.clock); return structuredClone(s);
  }); }
  async current(id: string, intent?: string) {
    const rows = [...this.runs.values()].filter(r => r.sessionId === id && (intent === undefined || r.intent === intent));
    const r = rows.find(r => r.state !== 'CANCELLED') ?? rows.at(-1);
    if (!r) return null;
    const result = structuredClone(r);
    if (r.deletedAt || r.contentExpiresAt <= this.clock || this.owned(id).revokedAt) result.input = result.result = null;
    return result;
  }
  reserve(id: string, intent: string, hash: string, input: unknown, p: GuestPolicy, executor: string) { return this.serial(() => {
    const prior = [...this.runs.values()].find(r => r.sessionId === id && r.intent === intent);
    if (prior) {
      if (prior.fingerprint !== hash) throw guestError('GUEST_INTENT_CONFLICT', 409, 'Synthetic changed input');
      return { run: structuredClone(prior), created: false };
    }
    this.open();
    const s = this.owned(id);
    if (s.usedUntil || [...this.runs.values()].some(r => r.sessionId === id && r.state !== 'CANCELLED')) throw guestError('GUEST_USED', 409, 'Synthetic already reserved');
    if (s.revokedAt || s.issuedExpiresAt <= this.clock || !s.consentedAt || s.consentVersion !== p.consentVersion ||
      s.termsVersion !== p.termsVersion || s.privacyVersion !== p.privacyVersion) throw guestError('GUEST_CONSENT_REQUIRED', 403, 'Synthetic consent');
    if (BigInt(this.limits.occupiedMicros) + BigInt(p.maxCostMicros) > BigInt(this.limits.maxCostMicros!) ||
      this.limits.occupiedRequests + 1 > this.limits.maxRequests! || this.limits.activeRuns + 1 > this.limits.maxConcurrent!) {
      throw guestError('GUEST_LIMIT_REACHED', 429, 'Synthetic exhausted');
    }
    const r: GuestRun = { id: randomUUID(), sessionId: id, intent, fingerprint: hash, state: 'RESERVED',
      policy: structuredClone(p), input: structuredClone(input), result: null, deletedAt: null,
      contentExpiresAt: new Date(+this.clock + p.contentTtlMs), authorizedAt: null, executor, terminal: false };
    this.runs.set(r.id, r); this.receipts.set(r.id, { authorized: false, cancelled: false, released: false });
    this.limits.occupiedMicros = String(BigInt(this.limits.occupiedMicros) + BigInt(p.maxCostMicros));
    this.limits.occupiedRequests++; this.limits.activeRuns++;
    return { run: structuredClone(r), created: true };
  }); }
  authorize(id: string, executor: string) { return this.serial(() => {
    const r = this.runs.get(id);
    if (!r || r.executor !== executor || r.state !== 'RESERVED') return null;
    const s = this.owned(r.sessionId);
    if (this.limits.stopped || s.revokedAt || s.usedUntil || s.issuedExpiresAt <= this.clock || r.deletedAt ||
      r.contentExpiresAt <= this.clock || s.consentVersion !== r.policy.consentVersion || s.termsVersion !== r.policy.termsVersion ||
      s.privacyVersion !== r.policy.privacyVersion) return null;
    r.state = 'DISPATCH_AUTHORIZED'; r.authorizedAt = new Date(this.clock);
    s.usedUntil = new Date(+r.authorizedAt + r.policy.usedTtlMs); this.receipts.get(id)!.authorized = true;
    return structuredClone(r);
  }); }
  private cancelNow(r: GuestRun, executor?: string) {
    if (r.state !== 'RESERVED' || (executor && r.executor !== executor)) return;
    const receipt = this.receipts.get(r.id)!;
    r.state = 'CANCELLED'; r.input = r.result = null; r.deletedAt = new Date(this.clock);
    if (!receipt.cancelled) {
      receipt.cancelled = receipt.released = true;
      this.limits.occupiedMicros = String(BigInt(this.limits.occupiedMicros) - BigInt(r.policy.maxCostMicros));
      this.limits.occupiedRequests--; this.limits.activeRuns--;
    }
  }
  cancel(id: string, executor: string) { return this.serial(() => { const r = this.runs.get(id); if (r) this.cancelNow(r, executor); }); }
  finish(id: string, executor: string, outcome: { terminal: boolean; result?: unknown; usage?: unknown }) { return this.serial(() => {
    const r = this.runs.get(id);
    if (!r || r.executor !== executor || !['DISPATCH_AUTHORIZED', 'UNKNOWN'].includes(r.state)) return;
    r.state = outcome.terminal ? outcome.result === undefined ? 'FAILED_TERMINAL' : 'SUCCEEDED' : 'UNKNOWN';
    r.terminal = outcome.terminal;
    r.result = outcome.terminal && outcome.result !== undefined && !r.deletedAt && r.contentExpiresAt > this.clock &&
      !this.owned(r.sessionId).revokedAt ? structuredClone(outcome.result) : null;
    if (!outcome.terminal) this.limits.stopped = true;
    else if (!this.receipts.get(id)!.released) { this.receipts.get(id)!.released = true; this.limits.activeRuns--; }
  }); }
  erase(id: string) { return this.serial(() => {
    this.owned(id).revokedAt ??= new Date(this.clock);
    for (const r of this.runs.values()) if (r.sessionId === id) { this.cancelNow(r); r.deletedAt ??= new Date(this.clock); r.input = r.result = null; }
  }); }
  cleanup() { return this.serial(() => {
    let count = 0;
    for (const r of this.runs.values()) if (r.contentExpiresAt <= this.clock) {
      this.cancelNow(r);
      if (r.state === 'DISPATCH_AUTHORIZED') { r.state = 'UNKNOWN'; this.limits.stopped = true; }
      if (!r.deletedAt) { count++; r.deletedAt = new Date(this.clock); r.input = r.result = null; }
    }
    return count;
  }); }
  recover() { return this.serial(() => {
    for (const r of this.runs.values()) {
      this.cancelNow(r);
      if (['DISPATCH_AUTHORIZED', 'UNKNOWN'].includes(r.state)) { r.state = 'UNKNOWN'; this.limits.stopped = true; }
    }
  }); }
}

export function protocolRuntime(): GuestRuntime {
  return { origin: 'http://127.0.0.1:4180', allowLocalHttp: true, issueTtlMs: 60 * 60 * 1000,
    policy: { model: 'synthetic-model', pricingVersion: 'synthetic-price-v1', tokenBoundVersion: 'synthetic-bound-v1',
      inputTokenBound: 12000, maxOutputTokens: 8192, maxCostMicros: '100', promptVersion: 'kigen-prompt-v2',
      schemaVersion: 'kigen-analysis-result-v2', termsVersion: 'synthetic-terms', privacyVersion: 'synthetic-privacy',
      consentVersion: 'synthetic-guest-consent', contentTtlMs: 24 * 60 * 60 * 1000, usedTtlMs: 30 * 24 * 60 * 60 * 1000 },
    notice: 'Synthetic test fixture. Not a published legal release.', verifyTokenBound: () => true };
}
export function protocolInput(intent: string = randomUUID()) {
  return { intent, input: { person: { displayName: 'Synthetic person', relationshipType: 'friend' },
    currentCase: { userAgeRange: 'unknown', userGender: 'unknown', perceivedPartnerReaction: 'unknown',
      elapsedTimeType: 'unknown', eventFacts: 'Synthetic event for protocol testing', userResponseType: 'none', userResponseText: null } } };
}
