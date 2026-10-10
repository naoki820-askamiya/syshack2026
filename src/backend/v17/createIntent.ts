import { createHash } from 'node:crypto';
import { Prisma } from '../generated/prisma/client.js';
import { AppError } from '../utils/index.js';

// Fixed-field, versioned server input: no generated times, current snapshots or trace IDs.
export function personIntentFingerprint(data: { displayName: string; relationshipType: string; notes?: string | null }) {
  return fingerprint(['person', data.displayName.trim(), data.relationshipType, data.notes?.trim() ?? null]);
}
export function caseIntentFingerprint(data: { personId: string; userAgeRange: string; userGender: string;
  perceivedPartnerReaction: string; elapsedTimeType: string; eventFacts: string; userResponseType: string; userResponseText: string | null }) {
  return fingerprint(['case', data.personId.toLowerCase(), data.userAgeRange.trim(), data.userGender.trim(),
    data.perceivedPartnerReaction.trim(), data.elapsedTimeType.trim(), data.eventFacts.trim(),
    data.userResponseType, data.userResponseText?.trim() ?? null]);
}
function fingerprint(fields: unknown[]) { return 'v1:' + createHash('sha256').update(JSON.stringify(fields)).digest('hex'); }

export function isCreateIntentCollision(error: unknown, table: 'persons' | 'analysis_cases') {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  const target = error.meta?.target;
  if (isIntentFields(target) || target === `${table}_user_id_create_intent_key_key`) return true;
  // Installed Prisma7 adapter-pg reports the verified constraint in adapter cause,
  // without meta.target. Inspect structured fields; never parse its SQL/message.
  const adapter = error.meta?.driverAdapterError;
  if (!adapter || typeof adapter !== 'object' || !('cause' in adapter)) return false;
  const cause = adapter.cause;
  if (!cause || typeof cause !== 'object' || !('kind' in cause) || cause.kind !== 'UniqueConstraintViolation' ||
    !('originalCode' in cause) || cause.originalCode !== '23505' || !('constraint' in cause)) return false;
  const constraint = cause.constraint;
  return !!constraint && typeof constraint === 'object' && 'fields' in constraint && isIntentFields(constraint.fields);
}
function isIntentFields(target: unknown) {
  return Array.isArray(target) && target.length === 2 &&
    (target.includes('user_id') && target.includes('create_intent_key') || target.includes('userId') && target.includes('createIntentKey'));
}
export function assertSameCreateIntent(stored: string | null, expected: string) {
  if (stored !== expected) throw new AppError({ code: 'CREATE_INTENT_CONFLICT', status: 409,
    message: '保存要求の内容が変更されています。新しい保存要求として送信してください。' });
}
// Internal retry metadata never appears in public resource envelopes.
export function publicCreatedResource<T extends object>(row: T): Omit<T, 'createIntentKey' | 'createIntentFingerprint'> {
  const { createIntentKey: _key, createIntentFingerprint: _hash, ...publicRow } = row as T & {
    createIntentKey?: unknown; createIntentFingerprint?: unknown;
  };
  return publicRow;
}
