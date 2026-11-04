# CAPTCHA 実装の検証・敵対的レビュー

対象は `feat/auth-turnstile` の認証 CAPTCHA 差分。比較元は `origin/develop` の `a28ae3bfc18991af12074a4d2b42c1d847914605`。
KIGEN404 敵対的レビュー Skill に従い、実装者のセルフレビューと独立コンテキストでの読み取りレビューを実施しました。
独立レビューの読み取り専用制約はツールで強制されていることまでは確認できていません。

## 確認と修正

1. セルフレビューで最新 develop の再設定メール経路を確認。Supabase の CAPTCHA 有効化でこの経路も対象になるため、画面と SDK の両方へトークンを接続しました。
2. 独立レビューで、CAPTCHA 未完了時にログイン画面の入力と再設定画面への移動まで無効になる回帰を確認。入力・移動は可能に戻し、認証送信だけを制限しました。回帰テストとブラウザで修正を確認しました。
3. 狭い画面で標準サイズの widget がフォーム幅を超えないよう compact サイズを採用しました。
4. 再レビューでは確認済み欠陥 0 件。トークンの単回消費、期限切れ・エラー時の無効化、離脱後の古い callback、登録済みアカウントの同意保存再試行を追跡しました。

## 自動検証

全テスト・型検査・クライアントとサーバーのビルド・Markdown 検査・同意文書 digest 検査を実行します。
CAPTCHA 固有のテストは `src/backend/v17/frontend.captcha.test.ts`、復旧導線の回帰テストは `frontend.passwordResetAffordance.test.ts` です。
SDK の再設定メール要求は合成 transport で検証し、実メールは送信しません。

## ブラウザで再現する方法

既存の `playwright-cli` を使用します。依存への追加は不要です。
以下の合成設定で Vite を `127.0.0.1:5178` に起動します。

```powershell
$env:VITE_SUPABASE_URL='https://captcha-test.invalid'
$env:VITE_SUPABASE_PUBLISHABLE_KEY='synthetic-test-key'
$env:VITE_TURNSTILE_SITE_KEY='synthetic-site-key'
$env:VITE_PASSWORD_RECOVERY_ENABLED='true'
npm run dev -- --host 127.0.0.1 --port 5178
```

別のターミナルで実行します。

```powershell
playwright-cli -s=captcha open http://127.0.0.1:5178/login
playwright-cli -s=captcha run-code --filename=scripts/check-auth-captcha-browser.js
playwright-cli -s=captcha close
```

スクリプトは Auth と Turnstile の通信を差し替え、実際の React 画面とインストール済み SDK を動かします。
登録・ログイン・再設定メールのトークン送信、期限切れ、失敗後の再確認、読込失敗と再試行、375px 幅の画面を検証しました。
外部 provider の応答は合成したものであり、実 Turnstile の判定、実 widget の見た目、Supabase の本番 CAPTCHA 検証は未確認です。
本番有効化の受入確認は [設定手順](auth-captcha.md) に記載しています。
