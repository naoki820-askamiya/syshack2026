export type GuestRunState = 'RESERVED' | 'DISPATCH_AUTHORIZED' | 'SUCCEEDED' | 'FAILED_TERMINAL' | 'UNKNOWN' | 'CANCELLED';
export interface GuestPolicy {
  model: string; pricingVersion: string; tokenBoundVersion: string;
  inputTokenBound: number; maxOutputTokens: number; maxCostMicros: string;
  promptVersion: string; schemaVersion: string;
  termsVersion: string; privacyVersion: string; consentVersion: string;
  contentTtlMs: number; usedTtlMs: number;
}
export interface GuestRun {
  id: string; sessionId: string; intent: string; fingerprint: string;
  state: GuestRunState; policy: GuestPolicy; input: unknown | null;
  result: unknown | null; deletedAt: Date | null; contentExpiresAt: Date;
  authorizedAt: Date | null; executor: string; terminal: boolean;
}
export interface GuestSession {
  id: string; tokenHash: string; issuedExpiresAt: Date; usedUntil: Date | null;
  revokedAt: Date | null;
  consentVersion: string | null; termsVersion: string | null; privacyVersion: string | null;
  consentedAt: Date | null;
}
export interface GuestBudget {
  stopped: boolean; maxCostMicros: string | null; maxRequests: number | null;
  maxConcurrent: number | null; issuanceLimit: number | null;
  issueWindowSeconds: number | null; issueWindowLimit: number | null;
  occupiedMicros: string; occupiedRequests: number; activeRuns: number;
}
// Implementations serialize mutations under the persistent singleton budget lock.
// No network request is permitted inside a repository transaction.
export interface GuestRepository {
  recover(): Promise<void>;
  budget(): Promise<GuestBudget>;
  session(tokenHash: string): Promise<GuestSession | null>;
  issue(tokenHash: string, expiresAt: Date): Promise<GuestSession>;
  consent(sessionId: string, policy: GuestPolicy): Promise<GuestSession>;
  current(sessionId: string, intent?: string): Promise<GuestRun | null>;
  reserve(sessionId: string, intent: string, fingerprint: string, input: unknown, policy: GuestPolicy, executor: string): Promise<{run: GuestRun; created: boolean}>;
  authorize(runId: string, executor: string): Promise<GuestRun | null>;
  cancel(runId: string, executor: string): Promise<void>;
  finish(runId: string, executor: string, outcome: { terminal: boolean; result?: unknown; usage?: unknown }): Promise<void>;
  erase(sessionId: string): Promise<void>;
  cleanup(): Promise<number>;
}
export interface GuestProviderResponse { terminal: boolean; result?: unknown; usage?: unknown }
export interface GuestProvider {
  generate(input: unknown, policy: GuestPolicy): Promise<GuestProviderResponse>;
}
