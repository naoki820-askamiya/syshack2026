export const captchaSiteKey = (import.meta.env.VITE_TURNSTILE_SITE_KEY ?? '').trim();

// Production must never silently fall back to unprotected authentication.
export const captchaRequired = import.meta.env.PROD || Boolean(captchaSiteKey);

export function requireCaptchaToken(token?: string): void {
  if (captchaRequired && (!captchaSiteKey || !token?.trim())) {
    throw new Error('bot 対策の確認を完了してください。確認できない場合はページを再読み込みしてください。');
  }
}
