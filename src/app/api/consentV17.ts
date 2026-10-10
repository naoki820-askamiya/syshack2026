import { fetchApiJson } from './client';
import { TERMS_VERSION, PRIVACY_POLICY_VERSION } from '../../shared/legal';

export interface ConsentState { accepted: boolean; termsVersion: string; privacyPolicyVersion: string; consentedAt: string | null }
export const getConsent = (signal?: AbortSignal) => fetchApiJson<ConsentState>('/api/legal-consent', { signal });
export const recordConsent = () => fetchApiJson<ConsentState>('/api/legal-consent', {
  method: 'POST', body: JSON.stringify({ accepted: true, termsVersion: TERMS_VERSION, privacyPolicyVersion: PRIVACY_POLICY_VERSION }),
});
