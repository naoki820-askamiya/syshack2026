-- Prismaのshadow DBだけでSupabase管理テーブルへの参照を解決するstubです。
-- アプリ用usersテーブルや独自認証基盤として利用しません。
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid AS $$
  SELECT NULL::uuid;
$$ LANGUAGE sql STABLE;
