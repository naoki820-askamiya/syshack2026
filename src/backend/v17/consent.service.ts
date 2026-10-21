import { prisma } from '../prisma/client.js';
import { z } from 'zod';
import { AppError } from '../utils/index.js';
import { parseOrThrow } from './http.js';
import { TERMS_VERSION, PRIVACY_POLICY_VERSION } from '../../shared/legal.js';

const consentInput = z.object({
  accepted: z.literal(true),
  termsVersion: z.literal(TERMS_VERSION),
  privacyPolicyVersion: z.literal(PRIVACY_POLICY_VERSION),
}).strict();

const currentWhere = (userId: string) => ({ userId, termsVersion: TERMS_VERSION, privacyPolicyVersion: PRIVACY_POLICY_VERSION });

export async function getConsent(userId: string) {
  const record = await prisma.userConsentRecord.findFirst({ where: currentWhere(userId), orderBy: { consentedAt: 'desc' } });
  return { accepted: !!record, termsVersion: TERMS_VERSION, privacyPolicyVersion: PRIVACY_POLICY_VERSION,
    consentedAt: record?.consentedAt.toISOString() ?? null };
}

export async function recordConsent(userId: string, body: unknown) {
  parseOrThrow(consentInput, body);
  // Existing table has no user/version unique constraint. Serialize replays for
  // this user without introducing a migration or storing IP/user-agent values.
  const record = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`legal-consent:${userId}`}, 0))`;
    const existing = await tx.userConsentRecord.findFirst({ where: currentWhere(userId), orderBy: { consentedAt: 'desc' } });
    return existing ?? tx.userConsentRecord.create({ data: currentWhere(userId) });
  });
  return { accepted: true, termsVersion: TERMS_VERSION, privacyPolicyVersion: PRIVACY_POLICY_VERSION,
    consentedAt: record.consentedAt.toISOString() };
}

export async function requireCurrentConsent(userId: string) {
  if (!(await getConsent(userId)).accepted) throw new AppError({ code: 'LEGAL_CONSENT_REQUIRED', status: 403,
    message: '利用規約とプライバシーポリシーを確認してから、相談の保存・分析を行ってください。' });
}
