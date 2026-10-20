import { consumeRecoveryLink } from './recoveryBootstrap';
import { PasswordRecovery, RESET_REQUEST_INTERVAL_MS, sendRecoveryEmail } from './passwordRecovery';

const config = {
  url: import.meta.env.VITE_SUPABASE_URL ?? '',
  key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
  enabled: import.meta.env.VITE_PASSWORD_RECOVERY_ENABLED === 'true',
};
export const passwordRecoveryEnabled = config.enabled;
let recovery: PasswordRecovery | null = null;
let requestAllowedAt = 0;

export function getPasswordRecovery(): PasswordRecovery {
  recovery ??= new PasswordRecovery(consumeRecoveryLink(), config);
  return recovery;
}
export function recoveryRequestAllowedAt(): number { return requestAllowedAt; }
export function requestPasswordReset(email: string): boolean {
  if (!config.enabled || Date.now() < requestAllowedAt) return false;
  requestAllowedAt = Date.now() + RESET_REQUEST_INTERVAL_MS;
  // The UI receipt and 60-second countdown do not depend on account existence,
  // network outcome or provider timing. Provider-side quotas are separate.
  void sendRecoveryEmail(config, email, window.location.origin).catch(() => {});
  return true;
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => recovery?.invalidate());
  // BFCache can restore a JS heap. Never revive its private recovery session.
  window.addEventListener('pageshow', event => { if (event.persisted) recovery?.invalidate(); });
}
