import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import { AppError } from '../utils/index.js';
import type { GuestBudget, GuestPolicy, GuestRepository, GuestRun, GuestSession } from './types.js';

type Tx = Prisma.TransactionClient;
type SessionRow = Omit<GuestSession, 'tokenHash'> & { now: Date; tokenHash: string | null };
type BudgetRow = Omit<GuestBudget, 'issuanceLimit'> & { issuedTotal: bigint; issuanceLimit: string | null };
const scope = 'guest-v1';
const sessionFields = Prisma.sql`id, token_hash AS "tokenHash", issued_expires_at AS "issuedExpiresAt",
  used_until AS "usedUntil", revoked_at AS "revokedAt", consent_version AS "consentVersion",
  terms_version AS "termsVersion", privacy_version AS "privacyVersion", consented_at AS "consentedAt", clock_timestamp() AS now`;
const runFields = Prisma.sql`r.id, r.session_id AS "sessionId", r.intent, r.fingerprint, r.state, r.policy,
  CASE WHEN r.deleted_at IS NULL AND r.content_expires_at > clock_timestamp() AND s.revoked_at IS NULL THEN r.input_payload ELSE NULL END AS input,
  CASE WHEN r.deleted_at IS NULL AND r.content_expires_at > clock_timestamp() AND s.revoked_at IS NULL THEN r.result_payload ELSE NULL END AS result,
  COALESCE(r.deleted_at, s.revoked_at) AS "deletedAt", r.content_expires_at AS "contentExpiresAt",
  r.authorized_at AS "authorizedAt", r.executor, r.terminal`;

function error(code: string, message: string, status = 409): AppError {
  return new AppError({ code, message, status });
}
function configError(): never { throw error('GUEST_UNAVAILABLE', 'ゲスト体験は現在利用できません。', 503); }
function positiveInteger(value: number | null): value is number {
  return value !== null && Number.isSafeInteger(value) && value > 0;
}
function positiveMoney(value: string | null): value is string {
  return typeof value === 'string' && /^[1-9]\d{0,18}$/u.test(value) && BigInt(value) <= 9_223_372_036_854_775_807n;
}
function configured(budget: GuestBudget): void {
  if (!positiveMoney(budget.maxCostMicros) || !positiveInteger(budget.maxRequests) ||
    !positiveInteger(budget.maxConcurrent) || !positiveInteger(budget.issuanceLimit) ||
    !positiveInteger(budget.issueWindowSeconds) || !positiveInteger(budget.issueWindowLimit)) configError();
}
function open(budget: GuestBudget): void { configured(budget); if (budget.stopped) configError(); }
function active(session: SessionRow): boolean {
  return session.revokedAt === null && (session.usedUntil ?? session.issuedExpiresAt).getTime() > session.now.getTime();
}
function accepts(session: SessionRow, policy: GuestPolicy): boolean {
  return active(session) && session.usedUntil === null && session.consentedAt !== null &&
    session.consentVersion === policy.consentVersion && session.termsVersion === policy.termsVersion &&
    session.privacyVersion === policy.privacyVersion;
}
function validPolicy(policy: GuestPolicy): void {
  if (!policy || !positiveMoney(policy.maxCostMicros) || !positiveInteger(policy.contentTtlMs) ||
    !positiveInteger(policy.usedTtlMs) || !positiveInteger(policy.inputTokenBound) || !positiveInteger(policy.maxOutputTokens) ||
    [policy.model, policy.pricingVersion, policy.tokenBoundVersion, policy.promptVersion, policy.schemaVersion,
      policy.termsVersion, policy.privacyVersion, policy.consentVersion]
      .some(value => typeof value !== 'string' || value.trim() !== value || value.length < 1 || value.length > 160)) configError();
}
function publicSession(row: SessionRow): GuestSession {
  if (!row.tokenHash) throw error('GUEST_REQUIRED', 'ゲスト体験を開始してください。', 401);
  const { now: _clock, ...session } = row;
  return { ...session, tokenHash: row.tokenHash };
}
async function readBudget(tx: Pick<Tx, '$queryRaw'>, lock = false): Promise<BudgetRow> {
  const rows = await tx.$queryRaw<BudgetRow[]>(Prisma.sql`SELECT stopped, max_cost_micros::text AS "maxCostMicros",
    max_requests AS "maxRequests", max_concurrent AS "maxConcurrent", issuance_limit::text AS "issuanceLimit",
    issue_window_seconds AS "issueWindowSeconds", issue_window_limit AS "issueWindowLimit",
    occupied_micros::text AS "occupiedMicros", occupied_requests AS "occupiedRequests", active_runs AS "activeRuns",
    issued_total AS "issuedTotal" FROM guest_v1_budget WHERE scope = ${scope} ${lock ? Prisma.sql`FOR UPDATE` : Prisma.empty}`);
  if (!rows[0]) configError();
  return rows[0];
}
function publicBudget(row: BudgetRow): GuestBudget {
  const { issuedTotal: _issuedTotal, issuanceLimit, ...budget } = row;
  return { ...budget, issuanceLimit: issuanceLimit === null ? null : Number(issuanceLimit) };
}
async function lockSession(tx: Tx, id: string): Promise<SessionRow> {
  const [session] = await tx.$queryRaw<SessionRow[]>(Prisma.sql`SELECT ${sessionFields} FROM guest_v1_sessions WHERE id = ${id}::uuid FOR UPDATE`);
  if (!session) throw error('GUEST_REQUIRED', 'ゲスト体験を開始してください。', 401);
  return session;
}
async function runById(tx: Tx, id: string): Promise<GuestRun | null> {
  const rows = await tx.$queryRaw<GuestRun[]>(Prisma.sql`SELECT ${runFields} FROM guest_v1_runs r
    JOIN guest_v1_sessions s ON s.id = r.session_id WHERE r.id = ${id}::uuid`);
  return rows[0] ?? null;
}

// Every mutation takes the persistent global scope lock first. Network calls
// never belong to these transactions. Only a confirmed commit permits dispatch.
export function createGuestRepository(db: PrismaClient): GuestRepository {
  const mutate = <T>(operation: (tx: Tx, budget: BudgetRow) => Promise<T>): Promise<T> => db.$transaction(async tx => {
    const budget = await readBudget(tx, true);
    return operation(tx, budget);
  }, { maxWait: 30_000, timeout: 10_000 });
  const cancelReserved = async (tx: Tx, id: string, executor?: string): Promise<void> => {
    const changed = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`UPDATE guest_v1_runs
      SET state = 'CANCELLED', input_payload = NULL, result_payload = NULL, deleted_at = COALESCE(deleted_at, clock_timestamp()), updated_at = clock_timestamp()
      WHERE id = ${id}::uuid AND state = 'RESERVED' ${executor ? Prisma.sql`AND executor = ${executor}::uuid` : Prisma.empty} RETURNING id`);
    if (!changed[0]) return;
    const receipts = await tx.$queryRaw<Array<{ cost: bigint }>>(Prisma.sql`UPDATE guest_v1_receipts
      SET cancelled = true, slot_released = true WHERE run_id = ${id}::uuid AND NOT authorized AND NOT cancelled AND NOT slot_released
      RETURNING max_cost_micros AS cost`);
    if (!receipts[0]) throw error('GUEST_ACCOUNTING_CONFLICT', 'ゲスト利用状態を確認できません。', 503);
    await tx.$executeRaw`UPDATE guest_v1_budget SET occupied_micros = occupied_micros - ${receipts[0].cost},
      occupied_requests = occupied_requests - 1, active_runs = active_runs - 1, updated_at = clock_timestamp() WHERE scope = ${scope}`;
  };
  return {
    async budget() { return publicBudget(await readBudget(db)); },
    async session(tokenHash) {
      const [session] = await db.$queryRaw<SessionRow[]>(Prisma.sql`SELECT ${sessionFields} FROM guest_v1_sessions WHERE token_hash = ${tokenHash}`);
      return session ? publicSession(session) : null;
    },
    issue(tokenHash, expiresAt) {
      if (!/^[a-f0-9]{64}$/u.test(tokenHash)) return Promise.reject(error('GUEST_REQUIRED', 'ゲスト体験を開始してください。', 401));
      return mutate(async (tx, rawBudget) => {
        const budget = publicBudget(rawBudget); open(budget);
        const [clock] = await tx.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
        if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= clock.now) configError();
        const [count] = await tx.$queryRaw<Array<{ count: bigint }>>`SELECT count(*) AS count FROM guest_v1_sessions
          WHERE created_at > clock_timestamp() - (${budget.issueWindowSeconds} * interval '1 second')`;
        if (rawBudget.issuedTotal >= BigInt(budget.issuanceLimit!) || count.count >= BigInt(budget.issueWindowLimit!)) {
          throw error('GUEST_ISSUE_LIMIT', 'ゲスト体験の受付上限に達しました。', 429);
        }
        const [session] = await tx.$queryRaw<SessionRow[]>(Prisma.sql`INSERT INTO guest_v1_sessions(token_hash, issued_expires_at, created_at, updated_at)
          VALUES (${tokenHash}, ${expiresAt}, clock_timestamp(), clock_timestamp()) RETURNING ${sessionFields}`);
        await tx.$executeRaw`UPDATE guest_v1_budget SET issued_total = issued_total + 1, updated_at = clock_timestamp() WHERE scope = ${scope}`;
        return publicSession(session);
      });
    },
    consent(sessionId, policy) {
      return mutate(async tx => {
        const session = await lockSession(tx, sessionId);
        if (!active(session) || session.usedUntil !== null) throw error('GUEST_USED', 'このゲスト利用権では新しく開始できません。');
        const [updated] = await tx.$queryRaw<SessionRow[]>(Prisma.sql`UPDATE guest_v1_sessions
          SET consent_version = ${policy.consentVersion}, terms_version = ${policy.termsVersion}, privacy_version = ${policy.privacyVersion},
            consented_at = CASE WHEN consent_version = ${policy.consentVersion} AND terms_version = ${policy.termsVersion}
              AND privacy_version = ${policy.privacyVersion} THEN consented_at ELSE clock_timestamp() END, updated_at = clock_timestamp()
          WHERE id = ${sessionId}::uuid RETURNING ${sessionFields}`);
        return publicSession(updated);
      });
    },
    async current(sessionId, intent) {
      const [run] = await db.$queryRaw<GuestRun[]>(Prisma.sql`SELECT ${runFields} FROM guest_v1_runs r
        JOIN guest_v1_sessions s ON s.id = r.session_id WHERE r.session_id = ${sessionId}::uuid
        ${intent ? Prisma.sql`AND r.intent = ${intent}::uuid` : Prisma.empty}
        ORDER BY (r.state <> 'CANCELLED') DESC, r.created_at DESC, r.id DESC LIMIT 1`);
      return run ?? null;
    },
    reserve(sessionId, intent, fingerprint, input, policy, executor) {
      return mutate(async (tx, rawBudget) => {
        const session = await lockSession(tx, sessionId);
        const [existing] = await tx.$queryRaw<Array<{ id: string; fingerprint: string }>>`SELECT id, fingerprint FROM guest_v1_runs
          WHERE session_id = ${sessionId}::uuid AND intent = ${intent}::uuid`;
        if (existing) {
          if (existing.fingerprint !== fingerprint) throw error('GUEST_INTENT_CONFLICT', '同じ送信識別子で入力を変更できません。');
          return { run: (await runById(tx, existing.id))!, created: false };
        }
        const budget = publicBudget(rawBudget); open(budget); validPolicy(policy);
        if (session.usedUntil !== null) throw error('GUEST_USED', 'このゲスト利用権は受付済みです。結果を確認してください。');
        const [prior] = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM guest_v1_runs WHERE session_id = ${sessionId}::uuid AND state <> 'CANCELLED'`;
        if (prior) throw error('GUEST_USED', 'このゲスト利用権は受付済みです。結果を確認してください。');
        if (!accepts(session, policy)) throw error('GUEST_CONSENT_REQUIRED', 'ゲスト体験の利用条件を確認してください。', 403);
        if (BigInt(budget.occupiedMicros) + BigInt(policy.maxCostMicros) > BigInt(budget.maxCostMicros!) ||
          budget.occupiedRequests + 1 > budget.maxRequests! || budget.activeRuns + 1 > budget.maxConcurrent!) {
          throw error('GUEST_LIMIT_REACHED', 'ゲスト体験の受付上限に達しました。', 429);
        }
        const [created] = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`INSERT INTO guest_v1_runs
          (session_id, intent, fingerprint, state, policy, input_payload, content_expires_at, executor)
          VALUES (${sessionId}::uuid, ${intent}::uuid, ${fingerprint}, 'RESERVED', ${JSON.stringify(policy)}::jsonb,
            ${JSON.stringify(input)}::jsonb, clock_timestamp() + (${policy.contentTtlMs} * interval '1 millisecond'), ${executor}::uuid) RETURNING id`);
        await tx.$executeRaw`INSERT INTO guest_v1_receipts(run_id, budget_scope, max_cost_micros)
          VALUES (${created.id}::uuid, ${scope}, ${BigInt(policy.maxCostMicros)})`;
        await tx.$executeRaw`UPDATE guest_v1_budget SET occupied_micros = occupied_micros + ${BigInt(policy.maxCostMicros)},
          occupied_requests = occupied_requests + 1, active_runs = active_runs + 1, updated_at = clock_timestamp() WHERE scope = ${scope}`;
        return { run: (await runById(tx, created.id))!, created: true };
      });
    },
    authorize(runId, executor) {
      return mutate(async (tx, rawBudget) => {
        const run = await runById(tx, runId);
        if (!run || run.state !== 'RESERVED' || run.executor !== executor) return null;
        const session = await lockSession(tx, run.sessionId);
        const budget = publicBudget(rawBudget);
        if (budget.stopped || run.deletedAt !== null || run.input === null || run.contentExpiresAt <= session.now || !accepts(session, run.policy)) return null;
        configured(budget); validPolicy(run.policy);
        const [changed] = await tx.$queryRaw<Array<{ id: string }>>`UPDATE guest_v1_runs SET state = 'DISPATCH_AUTHORIZED',
          authorized_at = clock_timestamp(), updated_at = clock_timestamp()
          WHERE id = ${runId}::uuid AND executor = ${executor}::uuid AND state = 'RESERVED' RETURNING id`;
        if (!changed) return null;
        const receiptCount = await tx.$executeRaw`UPDATE guest_v1_receipts SET authorized = true
          WHERE run_id = ${runId}::uuid AND NOT authorized AND NOT cancelled AND NOT slot_released`;
        if (receiptCount !== 1) throw error('GUEST_ACCOUNTING_CONFLICT', 'ゲスト利用状態を確認できません。', 503);
        await tx.$executeRaw`UPDATE guest_v1_sessions SET used_until =
          (SELECT authorized_at FROM guest_v1_runs WHERE id = ${runId}::uuid) + (${run.policy.usedTtlMs} * interval '1 millisecond'),
          updated_at = clock_timestamp() WHERE id = ${session.id}::uuid AND used_until IS NULL`;
        return runById(tx, runId);
      });
    },
    cancel(runId, executor) { return mutate(async tx => cancelReserved(tx, runId, executor)); },
    finish(runId, executor, outcome) {
      return mutate(async tx => {
        const run = await runById(tx, runId);
        if (!run || run.executor !== executor || !['DISPATCH_AUTHORIZED', 'UNKNOWN'].includes(run.state)) return;
        const session = await lockSession(tx, run.sessionId);
        const canSave = outcome.terminal && outcome.result !== undefined && run.deletedAt === null && run.contentExpiresAt > session.now && session.revokedAt === null;
        const state = outcome.terminal ? outcome.result === undefined ? 'FAILED_TERMINAL' : 'SUCCEEDED' : 'UNKNOWN';
        await tx.$executeRaw(Prisma.sql`UPDATE guest_v1_runs SET state = ${state}, terminal = ${outcome.terminal},
          result_payload = ${canSave ? JSON.stringify(outcome.result) : null}::jsonb,
          usage_observation = ${outcome.usage === undefined ? null : JSON.stringify(outcome.usage)}::jsonb, updated_at = clock_timestamp()
          WHERE id = ${runId}::uuid AND executor = ${executor}::uuid AND state IN ('DISPATCH_AUTHORIZED', 'UNKNOWN')`);
        if (!outcome.terminal) {
          await tx.$executeRaw`UPDATE guest_v1_budget SET stopped = true, updated_at = clock_timestamp() WHERE scope = ${scope}`;
          return;
        }
        const released = await tx.$executeRaw`UPDATE guest_v1_receipts SET slot_released = true
          WHERE run_id = ${runId}::uuid AND authorized AND NOT cancelled AND NOT slot_released`;
        if (released === 1) await tx.$executeRaw`UPDATE guest_v1_budget SET active_runs = active_runs - 1, updated_at = clock_timestamp() WHERE scope = ${scope}`;
      });
    },
    erase(sessionId) {
      return mutate(async tx => {
        await lockSession(tx, sessionId);
        await tx.$executeRaw`UPDATE guest_v1_sessions SET revoked_at = COALESCE(revoked_at, clock_timestamp()), updated_at = clock_timestamp() WHERE id = ${sessionId}::uuid`;
        const reserved = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM guest_v1_runs WHERE session_id = ${sessionId}::uuid AND state = 'RESERVED'`;
        for (const run of reserved) await cancelReserved(tx, run.id);
        await tx.$executeRaw`UPDATE guest_v1_runs SET deleted_at = COALESCE(deleted_at, clock_timestamp()), input_payload = NULL,
          result_payload = NULL, updated_at = clock_timestamp() WHERE session_id = ${sessionId}::uuid`;
      });
    },
    recover() {
      return mutate(async tx => {
        // Startup is deliberately conservative across instances: revoke every
        // outstanding predispatch executor before refunding, and fence all
        // authorized unresolved work into UNKNOWN. No worker may replay it.
        const reserved = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM guest_v1_runs WHERE state = 'RESERVED'`;
        for (const run of reserved) await cancelReserved(tx, run.id);
        const unknown = await tx.$queryRaw<Array<{ id: string }>>`UPDATE guest_v1_runs SET state = 'UNKNOWN', updated_at = clock_timestamp()
          WHERE state = 'DISPATCH_AUTHORIZED' RETURNING id`;
        const [existing] = await tx.$queryRaw<Array<{ exists: boolean }>>`SELECT EXISTS(SELECT 1 FROM guest_v1_runs WHERE state = 'UNKNOWN') AS exists`;
        if (unknown.length > 0 || existing.exists) {
          await tx.$executeRaw`UPDATE guest_v1_budget SET stopped = true, updated_at = clock_timestamp() WHERE scope = ${scope}`;
        }
      });
    },
    cleanup() {
      return mutate(async tx => {
        const reserved = await tx.$queryRaw<Array<{ id: string }>>`SELECT r.id FROM guest_v1_runs r JOIN guest_v1_sessions s ON s.id = r.session_id
          WHERE r.state = 'RESERVED' AND (r.content_expires_at <= clock_timestamp() OR s.issued_expires_at <= clock_timestamp() OR s.revoked_at IS NOT NULL)`;
        for (const run of reserved) await cancelReserved(tx, run.id);
        // TTL is not provider terminal proof: hold all authorized occupancy.
        const unknown = await tx.$executeRaw`UPDATE guest_v1_runs SET state = 'UNKNOWN', updated_at = clock_timestamp()
          WHERE state = 'DISPATCH_AUTHORIZED' AND content_expires_at <= clock_timestamp()`;
        if (unknown > 0) await tx.$executeRaw`UPDATE guest_v1_budget SET stopped = true, updated_at = clock_timestamp() WHERE scope = ${scope}`;
        const cleared = await tx.$executeRaw`UPDATE guest_v1_runs SET input_payload = NULL, result_payload = NULL,
          deleted_at = COALESCE(deleted_at, clock_timestamp()), updated_at = clock_timestamp()
          WHERE content_expires_at <= clock_timestamp() AND deleted_at IS NULL`;
        await tx.$executeRaw`UPDATE guest_v1_sessions SET token_hash = NULL, updated_at = clock_timestamp()
          WHERE token_hash IS NOT NULL AND COALESCE(used_until, issued_expires_at) <= clock_timestamp()`;
        return cleared;
      });
    },
  };
}
