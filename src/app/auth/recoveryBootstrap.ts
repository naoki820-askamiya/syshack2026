// Runs before App (and its ordinary Supabase client) is evaluated. Never accept
// bearer-session callbacks as reset authority; only a provider-verified one-use OTP.
export function takeRecoveryLink(href: string, replace: (path: string) => void): string | null {
  const url = new URL(href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  const reset = url.pathname === '/reset-password';
  if (!reset && fragment.get('type') !== 'recovery') return null;
  const hashes = fragment.getAll('token_hash');
  const token = reset && !url.search && hashes.length === 1 &&
    /^[a-zA-Z0-9_-]{20,256}$/.test(hashes[0]) &&
    [...fragment.keys()].every(key => key === 'token_hash') ? hashes[0] : null;
  // Also remove legacy callback credentials/errors, query strings and history state.
  replace('/reset-password');
  return token;
}

const browser = (globalThis as { window?: {
  location: { href: string; reload: () => void };
  history: { replaceState: (state: null, title: string, path: string) => void };
  addEventListener: (event: 'hashchange', callback: () => void) => void;
} }).window;
let initialToken: string | null = browser ?
  takeRecoveryLink(browser.location.href, path => browser.history.replaceState(null, '', path)) : null;

// Clicking another email link while this exact page is open is a fragment-only
// navigation. Restart the isolated flow instead of reusing a spent controller.
browser?.addEventListener('hashchange', () => {
  const url = new URL(browser.location.href);
  if (url.pathname === '/reset-password' && url.hash) browser.location.reload();
});

export function consumeRecoveryLink(): string | null {
  const token = initialToken;
  initialToken = null;
  return token;
}
