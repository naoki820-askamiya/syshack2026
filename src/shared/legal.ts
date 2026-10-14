// Update the digest when the title, draft notice or sections change. Regression
// tests check the complete SHA-256; its prefix makes the resulting consent
// version change even if the human-readable release label was left unchanged.
// Draft acknowledgements must never be reused for a published release.
export const TERMS_CONTENT_SHA256 = '4044d608c8c4d01a12aee0610817eed75d8d054ad191624b46e15eb66a003174';
export const PRIVACY_CONTENT_SHA256 = 'a616817615faca7edac269ee2582c6fcfedd24c2400ace90bfb82760bbfdbc35';
export const TERMS_VERSION = `2026-10-07-draft-2-${TERMS_CONTENT_SHA256.slice(0, 16)}`;
export const PRIVACY_POLICY_VERSION = `2026-10-07-draft-2-${PRIVACY_CONTENT_SHA256.slice(0, 16)}`;

export function safeLegalReturnTo(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/u.test(value)) return '/new';
  const path = value.split(/[?#]/u)[0];
  if (['/consent', '/login', '/register', '/signup'].includes(path)) return '/new';
  return value;
}
