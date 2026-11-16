# Cookie認証の本番反映

対象は`naoki820-askamiya/syshack2026`のmain、フロントは`https://kigen404.vercel.app`、APIは`https://kigen404.onrender.com`。Render Service IDは`srv-d74au3euk2gs73a1tv0g`。

## 反映する設定

- VercelはGit連携で反映する。通常の認証・業務APIは同じOriginの`/api`に固定し、外部rewriteでRenderへ転送する。古い`VITE_SERVER_URL`の上書きは不要。
- APIの外部rewriteキャッシュを明示的に無効にする。Cookie・Origin・複数のSet-Cookieを通過させる。
- Renderは`AUTH_COOKIE_SECRET`（本番専用の64桁hex）、`AUTH_COOKIE_SECURE=true`、`ALLOWED_ORIGINS=https://kigen404.vercel.app`、`NODE_ENV=production`を使用する。鍵を文書・PR・ログへ記載しない。
- Supabaseの既存URL・公開可能キーは保持する。Site URLと登録メールのRedirect URLsは本番トップへ向ける。パスワード再設定の設定は維持し、今回新たに有効化しない。
- Node.jsは既存mainの`.node-version`に従い22.23.5を使用する。

## 反映順序

1. Renderの環境変数をSave onlyで保存する。
2. 最新mainから統合した反映用ブランチのテスト・型・ビルド・起動検証を通す。
3. RenderのDeploy a specific commitで検証済みブランチのSHAを先に反映する。Build Commandは依存導入とbuildのみ、Start Commandは`npm run start`。migration・seed・DB resetを実行しない。
4. RenderでREADYを確認し、匿名のsession取得とlogoutのCookie削除応答でHTTPS属性を確認する。
5. PRをmainへ統合し、Vercelがそのコミットを反映したことをGitHub deploymentで確認する。
6. 本番URLの`/api/auth/session`と匿名logoutで、Origin維持・no-store・複数Set-Cookieの通過を確認する。実アカウントのログイン確認は利用者の操作で行い、相談保存・AI分析はこの配備確認に使わない。

## 復帰

反映失敗時はフロントを直前のmainへ戻し、Renderは直前の成功コミットへ戻す。新しい鍵は不用意に再生成しない。Cookieを使わない旧Bearerクライアントの互換経路は保持する。今回の差分にはDB schema・migrationの変更を含めない。

## 検証の範囲

合成Auth・DBモックの回帰、実SDKのPKCE検証、実ブラウザのCookie・複数タブの確認を行う。本番の認証基盤・ドメイン・Cookie転送は配備後の観測として分けて記録し、CIの成功で代用しない。パスワード再設定の専用一時セッションは既存仕様を維持し、通常Cookieの復元が終わってから開始する。
