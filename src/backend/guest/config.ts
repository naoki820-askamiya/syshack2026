import type { GuestPolicy } from './types.js';

export interface GuestRuntime {
  origin: string; allowLocalHttp: boolean; issueTtlMs: number;
  policy: GuestPolicy; notice: string;
  // Covers the complete wire request, including instructions/schema. Bytes alone are not tokens.
  verifyTokenBound: (completeRequest: unknown) => boolean;
}

// No public legal release or model/price/token proof is approved yet.
// Environment values cannot inject a draft notice, arbitrary prices or an unknown model.
const APPROVED_RELEASES: ReadonlyMap<string, GuestRuntime> = new Map();
export function readGuestOrigin(): string | undefined {
  return APPROVED_RELEASES.get(process.env.GUEST_V1_RELEASE ?? '')?.origin;
}
export function readGuestRuntime(): GuestRuntime | null {
  if (process.env.GUEST_V1_ENABLED !== 'true') return null;
  const release = APPROVED_RELEASES.get(process.env.GUEST_V1_RELEASE ?? '');
  return release && validRuntime(release) ? release : null;
}

export function validRuntime(runtime: GuestRuntime): boolean {
  try {
    const url = new URL(runtime.origin);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.origin !== runtime.origin || url.username || url.password ||
      (url.protocol !== 'https:' && !(runtime.allowLocalHttp && local && url.protocol === 'http:')) ||
      (runtime.allowLocalHttp && process.env.NODE_ENV === 'production')) return false;
    const p = runtime.policy;
    return [p.model, p.pricingVersion, p.tokenBoundVersion, p.promptVersion, p.schemaVersion,
      p.termsVersion, p.privacyVersion, p.consentVersion, runtime.notice].every(v => typeof v === 'string' && v.trim().length > 0) &&
      /^\d+$/u.test(p.maxCostMicros) && BigInt(p.maxCostMicros) > 0n && BigInt(p.maxCostMicros) <= 9223372036854775807n &&
      [p.inputTokenBound, p.maxOutputTokens, p.contentTtlMs, p.usedTtlMs, runtime.issueTtlMs]
        .every(v => Number.isSafeInteger(v) && v > 0) &&
      p.usedTtlMs >= p.contentTtlMs && typeof runtime.verifyTokenBound === 'function';
  } catch { return false; }
}
