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
    // access token / refresh token をブラウザ永続ストレージへ保存しない安全寄りの設定です。
    // その代わり、ページリロード後はログイン状態が消える可能性があり、
    // access token 期限切れ後は再ログインが必要になります。
    // ログイン維持が必要になった段階で、HttpOnly Cookie / BFF 方式を検討します。
    autoRefreshToken: false,
    detectSessionInUrl: true,
    persistSession: false,
  },
});
