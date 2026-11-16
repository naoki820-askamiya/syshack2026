import { createClient } from '@supabase/supabase-js';
import { readEnv } from '../utils/index.js';

const storageKey = 'kigen-server-auth';
function client(verifier?: string) {
    const url = readEnv('SUPABASE_URL') ?? readEnv('VITE_SUPABASE_URL');
    const key = readEnv('SUPABASE_PUBLISHABLE_KEY') ?? readEnv('VITE_SUPABASE_PUBLISHABLE_KEY') ?? readEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
    if (!url || !key) throw new Error('Supabase Auth のサーバー環境変数が未設定です。');
    // Every operation has isolated memory storage, including its PKCE verifier.
    // No shared logged-in SDK client, disk storage, service-role key or Auth DB.
    const memory = new Map<string, string>();
    if (verifier) memory.set(storageKey + '-code-verifier', JSON.stringify(verifier));
    const sdk = createClient(url, key, { auth: { storageKey, flowType: 'pkce', persistSession: true,
        autoRefreshToken: false, detectSessionInUrl: false, storage: {
            getItem: key => memory.get(key) ?? null,
            setItem: (key, value) => { memory.set(key, value); }, removeItem: key => { memory.delete(key); },
        } }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15_000) }) } });
    return { sdk, verifier: () => {
        const stored = memory.get(storageKey + '-code-verifier'); return stored ? JSON.parse(stored) as string : null;
    } };
}

export const browserAuthProvider = {
    signIn: (email: string, password: string) => client().sdk.auth.signInWithPassword({ email, password }),
    signUp: async (email: string, password: string, displayName: string | undefined, origin: string) => {
        const auth = client();
        const result = await auth.sdk.auth.signUp({ email, password,
            options: { emailRedirectTo: origin + '/', data: displayName ? { display_name: displayName } : undefined } });
        return { ...result, verifier: auth.verifier() };
    },
    resend: (email: string, origin: string) => client().sdk.auth.resend({ type: 'signup', email, options: { emailRedirectTo: origin + '/' } }),
    exchange: (code: string, verifier: string) => client(verifier).sdk.auth.exchangeCodeForSession(code),
    refresh: (refresh_token: string) => client().sdk.auth.refreshSession({ refresh_token }),
    signOut: (accessToken: string) => client().sdk.auth.admin.signOut(accessToken, 'local'),
};
