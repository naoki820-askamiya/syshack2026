# 認証の CAPTCHA 設定

登録・ログイン・パスワード再設定メールの依頼に Cloudflare Turnstile を使います。
既存の Supabase Auth がサーバー側でトークンを検証します。アプリに検証用の秘密鍵を置く必要はありません。
フロントエンドだけの導入では直接の Auth API 呼び出しを防げないため、Supabase 側の有効化が必須です。

## 導入手順

1. Cloudflare Turnstile に Managed widget を作成し、公開先・検証用のホスト名を限定します。
2. 対象環境のフロントエンドのビルド変数に `VITE_TURNSTILE_SITE_KEY`（公開キー）を設定します。
3. Supabase Auth の CAPTCHA protection を有効にし、provider に Turnstile、secret に対応する秘密鍵を設定します。
4. フロントエンドを再ビルド・配信し、登録・ログイン・再設定メールの3経路を確認します。

秘密鍵を `VITE_` 変数やリポジトリに保存しないでください。Vite の公開キーはビルド時に埋め込まれます。
公開キーと Supabase の設定は同じ widget の組にします。新規アカウントを作る検証は専用の検証環境で行います。
既存の公開環境ではメンテナンス時間を設けるなど、設定と配信の切替を調整してください。
この PR だけでは Cloudflare/Supabase の外部設定は変更されません。

## 設定不足・障害・再試行

- 本番ビルドは公開キー未設定でも認証を許可しません。画面に設定不足を表示します。
- ローカル開発サーバーで公開キーがない場合だけ CAPTCHA を省略できます。キーを設定すれば開発中も必須になります。
- 読込失敗・期限切れ・確認のタイムアウト時には送信を止め、「確認をやり直す」から再試行できます。
- トークンはメモリ内だけに保持し、送信時に消費します。成功・失敗後の再送には新しい確認が必要です。
- 登録完了後に同意保存だけを再試行する場合、アカウント登録と CAPTCHA は繰り返しません。
- 再設定メールは従来どおりアカウントの有無・送信結果を明かさず、再送間隔も維持します。

## 公開前の確認

本番キーとホスト名制限、Supabase 設定を使う検証環境で、正常な3経路と、欠落・無効・使用済みトークンが Auth 側で拒否されることを確認します。
ブラウザの表示・fixture の成功は、本番での bot 検出精度や Supabase 側の保護の証明ではありません。
Cloudflare のテストキーはローカルや検証だけに使い、本番には使わないでください。
独自の CSP を設定している配信先では、Turnstile の script/frame の許可も公式手順に従って確認します。

AI 分析のユーザー単位の利用枠は別の仕組みです。既に認証済みの自動操作、分散攻撃、ゲスト API 全体をこの CAPTCHA だけで防ぐものではありません。

## 公式資料

- [Supabase Auth CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha)
- [Turnstile のブラウザへの組み込み](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/)
- [Turnstile のテストキー](https://developers.cloudflare.com/turnstile/troubleshooting/testing/)
