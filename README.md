# KIGEN404

KIGEN404は、出来事、相手の反応、自分の対応、関係性などを入力し、相手の感情傾向と次の行動をAIで整理するWebアプリです。
AIの出力は事実の断定や診断ではなく、複数の見方を比較するための参考情報として表示します。

現在のアプリでは、Supabase Authによるメールアドレス認証、人物と相談の登録、AI分析、結果表示、
人物ごとの履歴、分析Feedback、パーソナライズ設定を実装しています。

## 技術スタック

| 分類 | 使用技術 |
| --- | --- |
| フロントエンド | React 18、TypeScript、Vite 6、React Router 7、Tailwind CSS 4、Recharts、Lucide React |
| バックエンド | Node.js、Express 4、TypeScript、tsx |
| 認証 | Supabase Auth (`@supabase/supabase-js`) |
| DB | PostgreSQL、Prisma 7、`@prisma/adapter-pg` |
| AI | OpenAI Responses API、Structured Outputs、Zod |
| テスト | Node.js test runner、tsx |
| 開発環境 | Docker、Docker Compose |

DockerイメージはNode.js 22を使用します。

## 主な機能

- Supabase Authによる登録、ログイン、ログアウト
- 分析対象となる人物の登録と一覧表示
- 相談内容の登録とAI分析
- 6種類の感情スコア、根拠、代替解釈、推奨行動、返信例の表示
- 人物ごとの相談履歴と最新分析結果の再表示
- 分析結果へのFeedback登録
- パーソナライズ利用範囲の設定

## ディレクトリ構成

```text
.
├─ public/                         # 画像などの静的ファイル
├─ docs/                           # 現行仕様、DB設計、Docker開発手順、過去時点の調査資料
├─ src/
│  ├─ app/
│  │  ├─ api/                      # フロントエンドのAPIクライアントと変換処理
│  │  ├─ auth/                     # Supabase Authの初期化とReact Context
│  │  ├─ components/               # 画面共通コンポーネント
│  │  ├─ hooks/                    # 画面共通hooks
│  │  ├─ pages/                    # 各ページ
│  │  └─ utils/                    # 表示モデル変換とメモリ内キャッシュ
│  ├─ backend/
│  │  ├─ ai/v2/                    # AI入力、指示、出力Schema、検証
│  │  ├─ auth/                     # サーバー側Supabase Authクライアント
│  │  ├─ middlewares/              # 認証と共通エラーハンドリング
│  │  ├─ prisma/                   # Prisma schema、migration、DBクライアント
│  │  └─ v17/                      # 現在マウントされるAPI route/service/repository
│  ├─ main.tsx                     # フロントエンドのエントリーポイント
│  └─ server.ts                    # バックエンドのエントリーポイント
├─ compose.yaml                    # Composeの入口
├─ compose.services.yaml           # frontend/backendサービス定義
├─ Dockerfile
├─ package.json
├─ tsconfig.json                   # フロントを含むtypecheck設定
└─ tsconfig.server.json            # サーバーbuild設定
```

`src/backend/generated/prisma/`は`npm run prisma:generate`で生成されるPrisma Clientです。
現在の動作仕様は[現行仕様書](docs/仕様書.md)を参照してください。日付付きの調査メモや設計資料は、その時点の記録として現行実装と区別します。

## 環境変数

`.env`と`.env.local`はGit管理外です。ローカル開発ではリポジトリ直下に`.env.local`を作成してください。
実際の値はSupabase、PostgreSQL、OpenAIの各環境から取得します。

```dotenv
VITE_SERVER_URL=http://127.0.0.1:3000
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=

SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
DATABASE_URL=
DIRECT_URL=

OPENAI_API_KEY=
OPENAI_ANALYSIS_MODEL=

PORT=3000
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

| 変数 | 用途 | 備考 |
| --- | --- | --- |
| `VITE_SERVER_URL` | ブラウザから呼ぶAPIのURL | Vite開発時は未設定なら`http://127.0.0.1:3000` |
| `VITE_SUPABASE_URL` | フロントエンドのSupabase URL | 必須 |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | フロントエンドの公開可能キー | `VITE_SUPABASE_ANON_KEY`もコード上は利用可能 |
| `SUPABASE_URL` | バックエンドのSupabase URL | 未設定時は`VITE_SUPABASE_URL`を使用 |
| `SUPABASE_PUBLISHABLE_KEY` | access token検証に使う公開可能キー | 未設定時は`VITE_SUPABASE_PUBLISHABLE_KEY`または`NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `DATABASE_URL` | アプリ実行時のPostgreSQL接続先 | 必須 |
| `DIRECT_URL` | Prisma CLI用の直接接続先 | 未設定時は`DATABASE_URL`を使用 |
| `OPENAI_API_KEY` | OpenAI APIキー | AI分析に必須 |
| `OPENAI_ANALYSIS_MODEL` | AI分析で使うモデル | 未設定時は`OPENAI_MODEL`を使用 |
| `PORT` | Expressの待受ポート | 既定値は`3000` |
| `ALLOWED_ORIGINS` | CORSで許可するOrigin | カンマ区切り。`FRONTEND_ORIGIN`も利用可能 |

秘密情報を`VITE_`付きの変数へ入れないでください。`VITE_`付きの値はフロントエンドへ組み込まれます。

## ローカルセットアップ

### 1. 依存関係をインストールする

```bash
npm ci
```

### 2. 環境変数を設定する

前節を参考に`.env.local`を作成します。Supabase Auth側には、ログインに使用するユーザーが必要です。
このリポジトリは独自のユーザーテーブルやJWT発行処理を持ちません。

### 3. フロントエンドを起動する

```bash
npm run dev
```

`http://localhost:5173`を開きます。

### 4. バックエンドを起動する

別のターミナルで実行します。

```bash
npm run server:dev
```

`http://localhost:3000/health`が`{"status":"ok"}`を返せば起動しています。

## Dockerでの起動と停止

`compose.yaml`は`.env.local`をCompose変数展開とバックエンド環境変数に使用します。
PostgreSQLやSupabase自体はComposeサービスに含まれないため、`DATABASE_URL`などには外部の接続先を指定します。

初回起動または依存関係変更後:

```bash
docker compose up --build -d
```

通常起動:

```bash
docker compose up -d
```

状態とログの確認:

```bash
docker compose ps
docker compose logs -f
```

停止:

```bash
docker compose down
```

依存関係用のnamed volumeも削除する場合:

```bash
docker compose down -v
```

起動後のURLは、フロントエンドが`http://localhost:5173`、バックエンドが`http://localhost:3000`です。
詳細は[Docker開発環境セットアップ](docs/docker-development-setup.md)も参照してください。

## 開発用コマンド

| 目的 | コマンド |
| --- | --- |
| フロントエンド開発サーバー | `npm run dev` |
| バックエンド起動 | `npm run server` |
| バックエンド監視起動 | `npm run server:dev` |
| TypeScript検査 | `npm run lint` または `npm run typecheck` |
| Markdown検査 | `npm run lint:md` |
| 全テスト | `npm test` |
| フロントエンドbuild | `npm run build:client` |
| バックエンドbuild | `npm run build:server` |
| 全体build | `npm run build` |
| build済みサーバー起動 | `npm start` |

`lint`は現在ESLintではなく、`tsc --noEmit`によるTypeScript検査です。

## テスト

```bash
npm test
```

`src/backend/**/*.test.ts`をNode.js test runnerで実行します。主な対象は次のとおりです。

- AIリクエスト、出力Schema、安全性検証
- Supabase Auth必須APIと`userId`所有権境界
- 他人のリソースを404として隠す方針
- AnalysisCaseの状態遷移と同時実行制御
- AnalysisResultの保存と`version DESC`による最新判定
- フロント表示用の結果変換、相談入力の検証、人物別の最新履歴判定、メモリ内キャッシュ

## Prismaとmigration

Prisma設定は`src/backend/prisma.config.ts`、schemaは`src/backend/prisma/schema.prisma`、
SQL migrationは`src/backend/prisma/migrations/`にあります。

```bash
# schemaの検証
npm run prisma:validate

# schemaの整形
npm run prisma:format

# Prisma Clientの再生成
npm run prisma:generate

# migration適用状況の確認
npm run prisma:migrate:status

# 未適用migrationの適用
npm run prisma:migrate:deploy
```

`npm run build:server`は先にPrisma Clientを生成します。Compose起動時にmigrationは自動適用されません。

責務分担は次のとおりです。

- Prisma schema: アプリが利用するモデル、列、relation、Prisma Client生成に必要な定義
- SQL migration: RLS、CHECK制約、trigger、partial index、DESC indexなどのPostgreSQL固有設定
- `auth.users`: Supabase管理の外部テーブル。アプリ独自の`users`テーブルへ置き換えない

SQL固有設定をPrisma schemaだけで再現しようとせず、migration SQLを正として保守してください。

## APIとデータ保護の注意事項

- 認証の正本はSupabase Authです。バックエンドはBearer tokenをSupabaseで検証し、認証済み`user.id`を使用します。
- クライアントから`user_id`を受け取って所有者を決めません。
- DBアクセスは`userId`を検索・更新条件に含め、他人のリソースは403ではなく404として扱います。
- 最新のAnalysisResultは`created_at`ではなく`version DESC`で取得します。
- RLSも有効ですが、サーバー側の所有権条件を省略する理由にはしません。
- 相談本文やAI結果はPostgreSQLへ保存します。画面遷移用キャッシュはメモリ内だけで、`localStorage`へ業務データを保存しません。
- OpenAI Responses API呼び出しは`store: false`です。
- AI出力は診断や相手の感情の断定ではありません。実在人物の不要な個人情報を入力しないでください。

## 現在マウントされる主なAPI

保護APIはSupabase AuthのBearer tokenを要求します。`/api/me`だけはtoken未指定時に`user: null`を返し、
token指定時はSupabase Authで検証したユーザーを返します。

| Method | Path | 用途 |
| --- | --- | --- |
| `GET` | `/health` | ヘルスチェック |
| `GET` | `/api/me` | 認証ユーザー確認 |
| `POST` / `GET` | `/api/persons` | 人物作成・一覧 |
| `GET` / `PATCH` | `/api/persons/:personId` | 人物詳細・更新 |
| `POST` | `/api/persons/:personId/archive` | 人物のアーカイブ |
| `GET` | `/api/persons/:personId/profile` | 保存済み人物Profile取得 |
| `GET` | `/api/persons/:personId/analysis-cases` | 人物別相談一覧 |
| `POST` | `/api/analysis-cases` | 相談作成 |
| `GET` | `/api/analysis-cases/:caseId` | 相談詳細 |
| `POST` | `/api/analysis-cases/:caseId/analyze` | AI分析 |
| `GET` | `/api/analysis-cases/:caseId/results/latest` | 最新分析結果 |
| `GET` | `/api/analysis-cases/:caseId/results` | 分析結果一覧 |
| `GET` / `PATCH` | `/api/privacy-settings` | パーソナライズ設定 |
| `GET` / `DELETE` | `/api/user-pattern-summary` | 保存済みユーザー傾向要約の取得・削除 |
| `POST` / `GET` | `/api/analysis-results/:resultId/feedback` | Feedback作成・取得 |
| `PATCH` | `/api/analysis-feedbacks/:feedbackId` | Feedback更新 |

APIエラーは`error.code`、`error.message`、`error.status`、`error.requestId`を持つJSONで返します。
