import { createClient } from '@supabase/supabase-js';
import { readEnv } from '../utils/index.js';

let client: ReturnType<typeof createClient> | undefined;

function getClient() {
    if (client) return client;
    const supabaseUrl = readEnv('SUPABASE_URL') ?? readEnv('VITE_SUPABASE_URL');
    const supabaseAnonKey =
        readEnv('SUPABASE_PUBLISHABLE_KEY') ??
        readEnv('VITE_SUPABASE_PUBLISHABLE_KEY') ??
        readEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Supabase Auth のサーバー環境変数が未設定です。');
    }

    client = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
            // 認証の正本はSupabaseなので、APIサーバー独自のsessionを持たせません。
            autoRefreshToken: false,
            persistSession: false,
        },
    });
    return client;
}

// Importing routes must not require Auth configuration. Verification still fails
// closed through requireAuth's infrastructure-error handling when unavailable.
export const supabaseAuth = {
    auth: {
        getUser: (jwt?: string) => getClient().auth.getUser(jwt),
    },
};
