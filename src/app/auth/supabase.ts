import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Supabase Auth の公開環境変数が未設定です');
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    // 認証の正本はSupabaseに置き、tokenをブラウザへ永続化しない現在の再ログイン方針を維持します。
    autoRefreshToken: false,
    detectSessionInUrl: true,
    persistSession: false,
  },
});
