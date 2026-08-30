import { createClient } from '@supabase/supabase-js';
import { readEnv } from '../utils/index.js';

const supabaseUrl = readEnv('SUPABASE_URL') ?? readEnv('VITE_SUPABASE_URL');
const supabaseAnonKey =
    readEnv('SUPABASE_PUBLISHABLE_KEY') ??
    readEnv('VITE_SUPABASE_PUBLISHABLE_KEY') ??
    readEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase Auth のサーバー環境変数が未設定です。');
}

export const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        // 認証の正本はSupabaseなので、APIサーバー独自のsessionを持たせません。
        autoRefreshToken: false,
        persistSession: false,
    },
});
