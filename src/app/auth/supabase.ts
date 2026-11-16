import { createBrowserAuthClient } from './cookieClient';
export type { BrowserUser, BrowserSession } from './cookieClient';

// Production and development both use the same-origin /api proxy.
// Ignore legacy VITE_SERVER_URL values retained on the hosting service.
export const serverUrl = '';
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('kigen-auth') : null;

// Keep the AuthContext interface; all token operations now happen in Express.
export const supabase = createBrowserAuthClient({
  serverUrl,
  send: (input, init) => fetch(input, init),
  withLock: async operation => {
    if (!navigator.locks) throw new Error('ブラウザを更新して、もう一度お試しください。');
    return await navigator.locks.request('kigen-auth', operation);
  },
  broadcast: () => channel?.postMessage('changed'),
  takeCallbackCode: () => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const legacyTokens = /(?:^#|&)(?:access_token|refresh_token)=/.test(url.hash);
    if (code || legacyTokens) {
      url.searchParams.delete('code');
      if (legacyTokens) url.hash = '';
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    }
    // Delete only known legacy SDK keys, without reading or reusing tokens.
    const oldUrl = import.meta.env.VITE_SUPABASE_URL;
    if (oldUrl) {
      const key = `sb-${new URL(oldUrl).hostname.split('.')[0]}-auth-token`;
      try { for (const suffix of ['', '-user', '-code-verifier']) localStorage.removeItem(key + suffix); } catch { /* storage may be disabled */ }
    }
    return code;
  },
});

channel?.addEventListener('message', () => {
  supabase.invalidate();
  void supabase.revalidate();
});
window.addEventListener('focus', () => { void supabase.revalidate(); });
