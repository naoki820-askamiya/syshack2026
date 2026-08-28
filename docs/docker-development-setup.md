# KIGEN404 Docker開発環境セットアップ

この手順書は、KIGEN404を初めてローカル環境で動かすメンバー向けです。
Dockerを使うため、基本的にはPCへNode.jsやPostgreSQLを個別にインストールする必要はありません。

## 起動するもの

| 名前 | 役割 | URL・接続先 |
| --- | --- | --- |
| frontend | React＋Viteの画面 | `http://localhost:5173` |
| backend | ExpressのAPI | `http://localhost:3000` |
| Supabase Auth | ログイン・ユーザー認証 | 外部のSupabaseを利用 |
| PostgreSQL | アプリのデータ保存 | 外部のSupabaseを利用 |

Dockerで起動するのはfrontendとbackendだけです。SupabaseはDocker内には作りません。

## 最初の1回だけ行う準備

### 1. 必要なソフトを入れる

次のソフトを用意してください。

- Git、またはGitHub Desktop
- Docker Desktop
- コードを編集するエディター（Visual Studio Codeなど）

Docker Desktopを起動してから、ターミナルで次のコマンドを実行します。

```bash
docker compose version
docker info
```

バージョンやDockerサーバーの情報が表示されれば準備完了です。

### 2. リポジトリをPCへ取得する

GitHubのリポジトリ画面にある「Code」からURLをコピーし、Gitでcloneします。
GitHub Desktopを使ってcloneしても構いません。

以降のコマンドは、cloneしたKIGEN404のフォルダで実行してください。
ターミナルの現在位置に`compose.yaml`と`package.json`が見えていれば正しい場所です。

### 3. `.env.local`を用意する

プロジェクト管理者から、開発用の環境変数を安全な方法で受け取ってください。
リポジトリ直下に`.env.local`という名前で保存します。

必要な項目は次のとおりです。`=`の右側には、管理者から受け取った値を設定します。

```dotenv
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
DATABASE_URL=
DIRECT_URL=
OPENAI_API_KEY=
OPENAI_MODEL=
```

環境によっては`OPENAI_ANALYSIS_MODEL`などの追加項目が渡される場合があります。
その場合も、管理者から受け取った内容をそのまま設定してください。

注意事項：

- `.env.local`はGitへcommitしないでください。
- APIキーやDB接続URLをチャット、Issue、スクリーンショットへ載せないでください。
- 他のメンバーの個人用キーをコピーして使わないでください。
- frontendへ渡されるのは公開用の`VITE_`変数だけです。

## 初回起動

Docker Desktopが起動していることを確認し、リポジトリ直下で実行します。

```bash
docker compose --env-file .env.local up --build -d
```

初回はイメージと依存パッケージを準備するため、数分かかることがあります。
コマンドが終了したら状態を確認します。

```bash
docker compose ps
```

`frontend`と`backend`の両方が`Up`になっていれば起動成功です。

ブラウザで次のURLを開いてください。

- アプリ画面：`http://localhost:5173`
- APIの動作確認：`http://localhost:3000/health`

APIの画面に`{"status":"ok"}`と表示されれば、backendも動いています。

## 毎日の起動と停止

一度buildが終わった後は、通常は次のコマンドだけで起動できます。

```bash
docker compose --env-file .env.local up -d
```

ログを確認する場合は次を実行します。

```bash
# frontendとbackendの両方
docker compose logs -f

# frontendだけ
docker compose logs -f frontend

# backendだけ
docker compose logs -f backend
```

ログ表示を終了するときは`Ctrl+C`を押します。ログ表示を終了してもコンテナは停止しません。

開発を終えるときは次を実行します。

```bash
docker compose down
```

## コードを変更したとき

`src`などのソースコードはPCからコンテナへbind mountされています。
ファイルを保存すると、frontendとbackendが自動的に変更を検知するため、通常はbuildし直す必要はありません。

次のファイルが変更された場合は、イメージと`node_modules`を作り直してください。

- `package.json`
- `package-lock.json`
- `Dockerfile`

```bash
docker compose down -v
docker compose --env-file .env.local up --build -d
```

`down -v`で削除されるのはローカルのコンテナ用volumeです。
外部サービスであるSupabaseのユーザーやDBデータは削除されません。

## Prisma migration

Prisma migrationはコンテナ起動時に自動実行されません。
まず現在の状態を確認できます。

```bash
docker compose run --rm backend npm run prisma:migrate:status
```

新しいmigrationを適用する場合だけ、次を実行します。

```bash
docker compose run --rm backend npm run prisma:migrate:deploy
```

DBを変更するコマンドなので、必要か分からない場合は実行前に担当者へ確認してください。
`prisma migrate reset`は開発用Supabaseのデータを削除する可能性があるため、勝手に実行しないでください。

## テスト

既存テストはbackendコンテナから実行できます。

```bash
docker compose run --rm backend npm test
```

最後に`fail 0`と表示されれば、すべて成功です。
現在のテストはSupabaseやOpenAIをモックしているため、このコマンドで実際のDBデータは変更されません。

## よくあるエラー

### Docker daemonへ接続できない

表示例：

```text
failed to connect to the docker API
```

Docker Desktopを起動し、起動完了を待ってからもう一度実行してください。

```bash
docker info
```

### 5173または3000ポートが使用中

別の開発サーバーや同じプロジェクトが既に起動している可能性があります。
先に不要なサーバーを停止し、次を実行してから起動し直してください。

```bash
docker compose down
docker compose --env-file .env.local up -d
```

### SupabaseまたはDBへ接続できない

次を確認してください。

- `.env.local`がリポジトリ直下にあるか
- 環境変数名のスペルが合っているか
- インターネットへ接続できるか
- 管理者から受け取った値が現在も有効か

エラーを共有するときも、`.env.local`の値そのものは貼り付けないでください。

### `Cannot find module`と表示される

依存関係が更新された可能性があります。volumeを作り直します。

```bash
docker compose down -v
docker compose --env-file .env.local up --build -d
```

### 画面やAPIが開かない

まずコンテナの状態とログを確認します。

```bash
docker compose ps
docker compose logs --tail 100 frontend backend
```

解決しない場合は、次の情報を担当者へ共有してください。

- 実行したコマンド
- 表示されたエラーメッセージ
- `docker compose ps`の結果
- エラーが起きる直前に変更したファイル

APIキー、DB接続URL、入力した個人情報は共有しないでください。

## コマンド早見表

| やりたいこと | コマンド |
| --- | --- |
| 初回起動・再build | `docker compose --env-file .env.local up --build -d` |
| 通常起動 | `docker compose --env-file .env.local up -d` |
| 状態確認 | `docker compose ps` |
| ログ確認 | `docker compose logs -f` |
| 停止 | `docker compose down` |
| 依存関係を作り直す | `docker compose down -v`の後に再build |
| テスト | `docker compose run --rm backend npm test` |
| migration状態確認 | `docker compose run --rm backend npm run prisma:migrate:status` |
| migration適用 | `docker compose run --rm backend npm run prisma:migrate:deploy` |
