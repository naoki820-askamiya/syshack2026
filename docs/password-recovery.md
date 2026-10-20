# パスワード再設定

## 有効化前の設定

ローカル実装には復旧メール依頼画面 `/forgot-password` と保存画面 `/reset-password` があります。
本番の設定・実配送は未確認です。既定では `VITE_PASSWORD_RECOVERY_ENABLED` が未設定のため依頼を送信しません。
次を確認した後、フロントエンドのビルド環境で `VITE_PASSWORD_RECOVERY_ENABLED=true` を指定します。
この作業で本番設定の変更・メール送信は行っていません。

1. Supabase の Site URL を正規の公開 origin に設定します。末尾の `/` は付けません。
2. Redirect URLs に正確な `https://<正規ホスト>/reset-password` を登録します。
   開発は別のプロジェクトで `http://localhost:5173/reset-password` 等の実際に使う URL を登録します。
   本番に広いワイルドカードを追加しません。アプリは現在の origin と固定パスから戻り先を作り、利用者指定の `returnTo` 等を採用しません。
3. **Reset password メールだけ**を次のリンクへ変更します。Signup 等のテンプレートを変更しません。
   `ConfirmationURL` による bearer-session callback はこの復旧画面では受け付けません。

   件名（設定案）: `【KIGEN404】パスワード再設定のご案内`

   ```html
   <h2>パスワードの再設定</h2>
   <p>ご自身で依頼した場合は、次のリンクから再設定してください。</p>
   <a href="{{ .SiteURL }}/reset-password#token_hash={{ .TokenHash }}">パスワードを再設定する</a>
   <p>心当たりがない場合は、このメールを無視してください。</p>
   ```

4. SMTP/送信元、メールのリンク追跡・書換え、配送、OTP 有効期限、認証側レート制限を確認します。
   `token_hash` をサーバーの GET ログへ送らないため fragment を使います。
   メールサービスが fragment を保持することもテストアカウントで確認します。
5. Password changed のセキュリティ通知を Supabase 側で有効にし、本文にパスワードを含めません。
   パスワード強度の設定は既存の登録方針と揃えます。画面の最低長は既存登録と同じ8文字で、追加の強度判定は Supabase が行います。
6. CAPTCHA は今回追加していません。既に有効なプロジェクトでは既存のログイン・登録を含めた対応確認が別途必要です。
   メール依頼画面の60秒待機は操作の重複抑止であり、サーバーの bot 防御ではありません。
7. 新ルートを含むデプロイと、専用テストアカウントによる実配送・期限切れ・再使用・保存・ログインを確認します。
   有効化フラグだけを先に投入せず、設定とコードを合わせて公開します。

## 採用した境界

通常の Supabase client は変更しません。`persistSession=false`、`autoRefreshToken=false`、`detectSessionInUrl=true` を維持します。
共有 client に `updateUser` を足すと、処理中のアカウント切替で別の session を選んだり、遅れた応答が古い session を再公開したりするためです。
既存の SDK 特性化テストと、新しい実経路の合成テストでこの境界を検証します。

復旧には別の非永続 client を使います。通常 client への `setSession`、ログインの公開、業務 API 呼び出しは行いません。
`token_hash` を通常 client 初期化前に一度だけ取り出して URL/history state から消します。
明示的な「リンクを確認して続ける」で SDK の `verifyOtp({ token_hash, type: 'recovery' })` を呼びます。
メールのプレビュー・リンク先の GET だけでコードを消費させません。
期限切れ・再使用の判定と、コードからの session 発行は Supabase が行います。
通常のログイン状態や URL の `type=recovery` だけでは復旧を許可しません。

専用 client の通信は、正規 Auth origin の検証・パスワード更新・終了の3エンドポイントに限定します。
更新・終了は検証直後の token に固定し、認証 epoch が変わっていれば送信しません。
自動 refresh は通信層でも禁止します。専用 client の応答が通常 client のユーザーやキャッシュを変更することはありません。
コード・session はメモリ内だけに置き、10分または session の有効期間（残り60秒を確保）を超えた更新を拒否します。
検証は15秒、保存と終了は合計20秒で打ち切り、結果が不明ならその事実と通常ログイン・再依頼の手順を案内します。

送信済みの更新は取消・離脱によってサーバー側まで巻き戻せません。
保存後は専用 client から global signOut を要求し、自動ログインを行わず、通常ログインへ案内します。
終了要求の失敗は「保存失敗」と混同せず表示します。発行済み access JWT の即時無効化までは保証しません。
別アカウントの通常 client の signOut は呼びません。

## UX と残る制約

- メール依頼の結果は登録の有無・provider エラー・通信時間に依存しない中立的な案内を即時表示します。
  配送成功とは断定せず、迷惑メール確認と再依頼を案内します。生のエラーやメールアドレスをログに出しません。
  ブラウザから認証 API へ直接送る構成なので、API 自体の情報漏洩・時間差対策は Supabase に依存します。
- 二重クリックを同期的に抑止し、依頼は60秒、検証・保存は処理中に再実行できません。
  確認入力の不一致・弱いパスワード等は入力をメモリ内で保持して訂正できます。
- パスワードはマスク表示、`autocomplete=new-password` を使用し、URL/永続ストレージ/ログには保存しません。
  完了・失効・離脱時はフォームと専用 session の参照を破棄します。
- 公開ルートなので未ログインでも使えます。ラベル・status/alert・エラーへの focus・44px以上の操作領域を設けます。
  モバイルでは1列の可変幅、16pxの入力文字を使います。
- 戻る・離脱・BFCache 復帰で復旧権限を失効させます。再読込後は URL にコードがなく再依頼が必要です。
  同じ画面で別のメールリンクを開く fragment-only 遷移は再読込して、新しい専用フローを開始します。
  同じメールの元リンクを再び開いた場合のコード再使用拒否は Supabase 側で行います。
  session token 付きの古いメールリンクは拒否して再依頼を案内します。

## 検証

`frontend.passwordRecovery.test.ts` は実際の Supabase SDK に合成 fetch を注入し、メール依頼、コード検証、保存、終了、エラー、アカウント切替、重複、期限を検証します。
生のコード・パスワードをテストログへ出しません。単体テストの偽 provider が示す一回利用は本番 provider の証明ではありません。

ブラウザ用の隔離環境は `node scripts/password-recovery-browser.mjs` で起動できます。
`http://127.0.0.1:4178` のローカル合成 Auth のみを使い、DB・外部 Auth・有料 AI には接続しません。
`/reset-password#token_hash=synthetic-valid-recovery-<任意の識別子>` で新しい合成リンクを作れます。
`/__recovery-fixture` は回数だけを返し、メール・パスワード・token は返しません。

実配送、本番の許可 URL/SMTP/通知設定、実ユーザーでの session 失効は未検証です。

## 参照した一次資料

- [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)
- [Supabase Password-based Auth](https://supabase.com/docs/guides/auth/passwords)
- [Supabase Email Templates](https://supabase.com/docs/guides/auth/auth-email-templates)
- [Supabase verifyOtp](https://supabase.com/docs/reference/javascript/auth-verifyotp)
- [Supabase Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [Supabase Auth Rate Limits](https://supabase.com/docs/guides/auth/rate-limits)
