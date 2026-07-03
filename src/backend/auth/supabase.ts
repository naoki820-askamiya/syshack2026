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
        // サーバー側は Authorization ヘッダーの token 検証だけを行い、
        // Supabase session をプロセス内や永続ストレージに保持しません。
        autoRefreshToken: false,
        persistSession: false,
    },
});
