# KIGEN404 Supabase PostgreSQL + Prisma 導入メモ 要約

現在日付：2026-05-12 JST

## 結論

KIGEN404では、認証は **Supabase Auth** に任せ、相談内容・人物メモ・AI解析結果・フィードバック・傾向要約などの業務データを **Supabase PostgreSQL** に保存する。

TypeScriptからDBを扱いやすくするために **Prisma** を使う。ただし、RLS・CHECK制約・trigger・partial index・DESC付きindexなど、PostgreSQL固有の重要な設定は **SQL migration** で管理する。

実装時の最重要ルールは、DB操作で必ず認証済みユーザーの `user_id` を条件に入れること。他人のデータIDを指定された場合は、存在しない場合と同じように `404 RESOURCE_NOT_FOUND` として扱う。

---

## 1. このDB構成の目的

KIGEN404では、次のデータをDBに保存する。

- 相談内容
- 人物メモ
- AI解析結果
- ユーザーのフィードバック
- 人物ごとの傾向要約
- ユーザー自身の不安傾向要約

認証は **Supabase Auth** に任せる。

そのため、アプリ側で次のものは作らない。

- 自前の `users` テーブル
- `auth_sessions` テーブル
- `password_hash`
- `refresh_token_hash`
- refreshToken ローテーションSQL

各業務データの所有者は、Supabase Auth の `auth.users.id` で管理する。

---

## 2. Prismaとは

Prismaは、TypeScriptからDBを扱いやすくするためのツール。

SQLを直接書く代わりに、TypeScriptで次のようにDB操作できる。

```ts
const persons = await prisma.person.findMany({
    where: { userId },
});
```

Prismaを使うメリットは、TypeScriptの型チェックが効くこと。

つまり、カラム名の間違いや型のミスに気づきやすくなる。

---

## 3. Supabase PostgreSQLとPrismaの関係

```text
Supabase PostgreSQL
→ 実際にデータを保存するDB本体

Prisma schema
→ TypeScriptからDBを扱うための設計図

SQL migration
→ 実際のDBにテーブル・制約・RLSなどを作る変更履歴

Prisma Client
→ TypeScriptコードからDBを操作する道具
```

---

## 4. なぜPrismaだけでなくSQL migrationも使うのか

Prisma schemaだけでは、Supabase PostgreSQL特有の設定を十分に表現しきれない。

そのため、次のものは **SQL migration側を正本** にする。

- `CREATE EXTENSION`
- `auth.users(id)` への外部キー
- CHECK制約
- `updated_at` trigger
- partial index
- `version DESC` 付き index
- Supabase RLS policy

特に **RLS policy** は、他人のデータを見せないための重要なセキュリティ設定なので、SQL migrationに明示する。

---

## 5. 主なファイルの役割

| ファイル             | 役割                                                         |
| -------------------- | ------------------------------------------------------------ |
| `package.json`       | Prismaコマンドをnpm scriptで実行できるようにする             |
| `prisma.config.ts`   | Prismaの設定ファイル。schema、migration、DB接続URLを指定する |
| `schema.prisma`      | Prisma Client用のmodel・enumを書く設計図                     |
| `migration.sql`      | Supabase PostgreSQLに実際のtable、constraint、RLSを作るSQL   |
| `init-shadow-db.sql` | Prismaのshadow database用に`auth.users`などを仮作成する      |
| `client.ts`          | backendから使うPrismaClientを初期化する                      |
| `.env.example`       | 必要な環境変数のサンプル                                     |

---

## 6. 重要なnpm script

### schemaを確認する

```bash
npm run prisma:validate
```

`schema.prisma` が正しいか確認する。

### Prisma Clientを生成する

```bash
npm run prisma:generate
```

TypeScriptから使うPrisma Clientを生成する。

### migration状態を確認する

```bash
npm run prisma:migrate:status
```

migrationがDBに適用済みか確認する。

### migrationを適用する

```bash
npm run prisma:migrate:deploy
```

レビュー済みのmigrationをSupabase DBに適用する。

本番相当DBでは、基本的に `prisma db push` や reset 系コマンドは使わない。

---

## 7. 主要テーブル

### `persons`

相談相手を保存するテーブル。

保存する主な情報は次のとおり。

- 表示名
- 関係性
- 年代ヒント
- 性別ヒント
- メモ
- アーカイブ状態

---

### `analysis_cases`

1回分の相談内容を保存するテーブル。

保存する主な情報は次のとおり。

- 何が起きたか
- 自分のメッセージ
- 相手のメッセージ
- 直前の会話
- 不安内容
- 解析状態
- 解析開始時刻
- 失敗情報
- 相談作成時点の人物情報スナップショット

---

### `analysis_results`

AI解析結果を履歴として保存するテーブル。

1つの相談ケースに対して、複数バージョンの解析結果を持てる。

最新結果は次の順で取得する。

```text
version DESC
```

`created_at DESC` は最新判定には使わない。

---

### `analysis_feedbacks`

AI解析結果に対するユーザーのフィードバックを保存するテーブル。

保存する主な情報は次のとおり。

- 役に立ったか
- 実際どうなったか
- ユーザーの補足・訂正

---

### `person_profiles`

人物ごとの「いつもの傾向」を保存するテーブル。

保存する主な情報は次のとおり。

- 普段の返信の長さ
- 普段のトーン
- 悪く見すぎなくてよい根拠
- AIに渡す補助文脈

---

### `user_pattern_summaries`

ユーザー自身の不安傾向を要約して保存するテーブル。

これは心理診断ではなく、利用履歴から見える傾向として扱う。

---

## 8. RLSとは

RLSは **Row Level Security** の略。

日本語では「行単位のアクセス制御」。

KIGEN404では、他人の相談内容を見せてはいけない。

そのため、各テーブルで次のような制御をする。

```sql
auth.uid() = user_id
```

意味は次のとおり。

```text
ログイン中ユーザーのID = この行の所有者ID
```

一致する行だけ、読める・更新できる・削除できるようにする。

---

## 9. 実装時の最重要ルール

DB操作では、必ず `user_id` 条件を入れる。

### 悪い例

```ts
await prisma.person.findUnique({
    where: { id: personId },
});
```

この書き方だと、他人の `personId` を指定されたときに見えてしまう危険がある。

### 良い例

```ts
await prisma.person.findFirst({
    where: {
        id: personId,
        userId,
        archivedAt: null,
    },
});
```

この書き方なら、ログイン中ユーザーの `userId` と一致するPersonだけ取得する。

他人のIDを指定された場合も、存在しない場合と同じように次を返す。

```text
404 RESOURCE_NOT_FOUND
```

---

## 10. まだ未実装の範囲

DBの箱とPrisma設定は用意したが、既存APIのrepositoryはまだ完全にはPrisma化されていない可能性がある。

次に差し替える候補はこの順番。

1. `persons.repository.ts`
2. `analysisCases.repository.ts`
3. `analysisResults.repository.ts`
4. `analysisFeedbacks` 用 repository追加
5. `personProfiles` 用 repository追加
6. `userPatternSummaries` 用 repository追加

---

## 11. 触ってはいけないもの

次はやらない。

- 実キー入り `.env` をGitHubに上げる
- Service Role Keyをfrontendに出す
- 自前 `users` テーブルを作る
- `auth_sessions` テーブルを作る
- `password_hash` を作る
- `refresh_token_hash` を作る
- 業務データを `localStorage` に保存する
- 最新結果取得を `created_at DESC` に変える
- 本番相当DBでreset系コマンドを実行する

---

## 12. メンバー共有用のさらに短い版

KIGEN404では、認証はSupabase Authに任せ、相談内容・人物メモ・AI解析結果などの業務データだけをSupabase PostgreSQLに保存する。

TypeScriptからDBを扱いやすくするためにPrismaを使うが、RLS・CHECK制約・trigger・partial indexなどPostgreSQL固有の重要設定はSQL migrationで管理する。

実装時は必ず認証済みユーザーの `user_id` を条件に入れ、他人のデータを指定された場合は存在しない場合と同じ `404 RESOURCE_NOT_FOUND` として扱う。

最新のAI解析結果は `created_at` ではなく `version DESC` で取得する。

現時点ではDBの設計とPrisma設定が中心で、次の作業は既存repositoryをPrisma実装へ置き換えること。

---

## 13. migrate deployでdatasource.urlエラーが出る場合

次のエラーは、PrismaがDB接続先を読めていないときに出る。

```text
Error: The datasource.url property is required in your Prisma config file when using prisma migrate deploy.
```

このリポジトリでは、`src/backend/prisma.config.ts` が次の順番で接続URLを読む。

```ts
url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
```

つまり、`DIRECT_URL` も `DATABASE_URL` も環境変数に存在しない場合、PrismaはどのDBへmigrationを流せばよいか判断できない。

### 直し方

`.env` に次の2つを追加する。

```env
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."
```

`DATABASE_URL` はアプリ実行時に使う接続先。Supabaseのpooler URLを使う想定。

`DIRECT_URL` はmigration用の接続先。`prisma.config.ts` は `DIRECT_URL` を優先する。

実キー入りの `.env` はGitHubに上げない。

### 今回確認した状態

手元の `.env` と `.env.local` には、少なくともキー名として `DATABASE_URL` / `DIRECT_URL` が存在しなかった。

そのため、まずSupabase DashboardのDatabase接続情報からURLを取得し、`.env` に追加する必要がある。

---

## 14. メンバー共有用 migration の使い方

### migration とは

Migration は、DB構造の変更履歴。

KIGEN404では、`src/backend/prisma/migrations` 配下のSQLをSupabase PostgreSQLへ順番に適用する。

今回適用済みのmigrationは次。

```text
20260512000000_init_supabase_kigen404
```

このmigrationで、KIGEN404用の業務テーブル、制約、index、trigger、RLS policyを作成した。

### 現在の適用状況

2026-05-15時点で、Supabase DBには次のmigrationが適用済み。

```text
20260512000000_init_supabase_kigen404 applied=true
```

確認済みの `public` テーブルは次。

```text
_prisma_migrations
analysis_cases
analysis_feedbacks
analysis_results
person_profiles
persons
user_pattern_summaries
```

`_prisma_migrations` はPrismaがmigration履歴を管理するテーブル。アプリの業務データではない。

### よく使うコマンド

#### migration 状態確認

```bash
npm run prisma:migrate:status
```

DBにどのmigrationが適用されているか確認する。

作業前にまずこれを実行すると、手元のmigrationとSupabase DBの状態がずれていないか分かる。

#### migration 適用

```bash
npm run prisma:migrate:deploy
```

未適用のmigrationをSupabase DBへ適用する。

共有DBや本番相当DBでは、基本的にこのコマンドを使う。

#### Prisma schema 検証

```bash
npm run prisma:validate
```

`schema.prisma` の書き方が正しいか確認する。

DBへ変更は加えない。

#### Prisma Client 生成

```bash
npm run prisma:generate
```

`schema.prisma` からTypeScript用のPrisma Clientを生成する。

modelやenumを変更したら実行する。

#### schema 整形

```bash
npm run prisma:format
```

`schema.prisma` の書式を整える。

DBへ変更は加えない。

### 使い分け

| やりたいこと | 使うコマンド |
| --- | --- |
| DBに未適用migrationがあるか見る | `npm run prisma:migrate:status` |
| Supabase DBへmigrationを適用する | `npm run prisma:migrate:deploy` |
| Prisma schemaの文法を確認する | `npm run prisma:validate` |
| Prisma Clientを生成する | `npm run prisma:generate` |
| schemaの見た目を整える | `npm run prisma:format` |

### 原則やらないコマンド

共有DB・本番相当DBでは、次は原則やらない。

```bash
prisma migrate reset
prisma db push
```

`prisma migrate reset` はDBをリセットする。データが消える危険がある。

`prisma db push` はmigration履歴を作らずにDB構造を直接変える。SQL migrationで管理しているRLS、trigger、partial index、DESC付きindexとの整合が崩れる危険がある。

KIGEN404では、DB変更はmigration SQLとしてレビュー可能な形で残す。

### 新しいDB変更を入れるときの流れ

1. `docs/database-design.md` と関連仕様を確認する。
2. `src/backend/prisma/schema.prisma` を変更する。
3. PostgreSQL固有の制約、trigger、partial index、DESC付きindex、RLS policyが必要ならSQL migrationに書く。
4. `npm run prisma:validate` を実行する。
5. `npm run prisma:generate` を実行する。
6. 開発DBでmigrationを検証する。
7. レビュー後、共有DBへ `npm run prisma:migrate:deploy` を実行する。

### P3005が出た場合

```text
Error: P3005
The database schema is not empty.
```

これは、Prismaが初回migrationを適用しようとしたが、対象DBの `public` schema が空ではない場合に出る。

今回のSupabase DBには古い開発用テーブルが残っていた。

削除した旧テーブルは次。

```text
public.analysis_result
public.analysos_cases
public.persons
```

`auth.*` のSupabase Authテーブルは削除していない。

削除後に `npm run prisma:migrate:deploy` を実行し、初回migrationを適用した。

今後P3005が出た場合は、既存テーブルをすぐ削除せず、まず次を確認する。

- そのDBが本当に開発用か
- 既存テーブルに残すべきデータがないか
- 既存構造とmigrationが一致しているか
- baselineでよい状態か
- データ移行SQLが必要か

既存データを残す必要がある場合は、削除ではなく移行計画を立てる。

---

## 15. メンバー共有用 テーブル要約

### 全体像

KIGEN404の業務データは、Supabase Authのユーザーを親として保存する。

```text
auth.users
  └─ persons
       └─ analysis_cases
            └─ analysis_results
                 └─ analysis_feedbacks

persons
  └─ person_profiles

auth.users
  └─ user_pattern_summaries
```

各業務テーブルには `user_id` がある。

`user_id` はSupabase Authの `auth.users.id`。

クライアントから `user_id` を送らせない。backend側で認証済みユーザーから決める。

### `persons`

相談対象の相手を保存するテーブル。

例:

- 上司A
- 友人A
- 恋人
- 家族
- 顧客

主なカラム:

| カラム | 意味 |
| --- | --- |
| `id` | Person ID |
| `user_id` | 所有ユーザー。Supabase Authの `auth.users.id` |
| `display_name` | 相手の表示名 |
| `relationship_type` | 関係性。上司、友人、家族など |
| `age_range` | 年代ヒント |
| `gender_hint` | 性別ヒント |
| `notes` | 相手に関するメモ |
| `archived_at` | アーカイブ日時 |

削除方針:

通常の非表示は物理削除ではなく `archived_at` を使う。

Personを編集・アーカイブしても、過去相談の `person_snapshot` は書き換えない。

### `analysis_cases`

1回分の相談内容を保存するテーブル。

AI解析の状態管理もここで行う。

主なカラム:

| カラム | 意味 |
| --- | --- |
| `id` | 相談ケースID |
| `user_id` | 所有ユーザー |
| `person_id` | 対象Person |
| `status` | `draft`, `analyzing`, `analyzed`, `failed` |
| `event_facts` | 実際に起きたこと |
| `self_message` | 自分が送った文 |
| `partner_message` | 相手が返した文 |
| `recent_conversation_text` | 直前の会話 |
| `app_type` | LINE、Slack、DMなど |
| `user_emotion` | 相談者の感情 |
| `assumed_partner_emotion` | 相手の感情についての予想 |
| `partner_speaking_style` | 相手の普段の話し方 |
| `context_note` | 背景事情 |
| `concern_text` | 不安点 |
| `person_snapshot` | 作成時点のPerson情報 |
| `analyze_run_id` | AI解析実行ID |
| `failure_code` | 失敗コード |
| `failure_message` | 失敗内容 |

重要ルール:

- `analyzing` のときは `analyze_run_id` と `analyze_started_at` が必要。
- 古いAI実行が後から戻っても現在の結果を壊さないように `analyze_run_id` を使う。
- 過去文脈を壊さないため、作成時点のPerson情報を `person_snapshot` に保存する。

### `analysis_results`

AI解析結果を履歴として保存するテーブル。

1つの `analysis_case` に複数の `analysis_results` を持てる。

主なカラム:

| カラム | 意味 |
| --- | --- |
| `id` | 解析結果ID |
| `user_id` | 所有ユーザー |
| `analysis_case_id` | 対象相談ケース |
| `analyze_run_id` | 対応するAI解析実行ID |
| `version` | ケース内の結果バージョン |
| `prompt_version` | 使用プロンプトの版 |
| `result_schema_version` | AI出力JSONの構造バージョン |
| `model` | 使用AIモデル名 |
| `result_json` | AI解析結果のJSON全文 |
| `created_at` | 作成日時 |

重要ルール:

最新結果は必ず `version DESC` で取得する。

`created_at DESC` を最新判定に使わない。

`result_json` には、スコアだけでなく次も保存する。

- 判断根拠
- 別解釈
- 悪く見すぎない理由
- 避ける行動
- 次の安全な行動

### `analysis_feedbacks`

AI解析結果に対するユーザーの振り返りを保存するテーブル。

主なカラム:

| カラム | 意味 |
| --- | --- |
| `id` | フィードバックID |
| `user_id` | 所有ユーザー |
| `analysis_case_id` | 対象相談ケース |
| `analysis_result_id` | 評価対象のAI解析結果 |
| `was_helpful` | 役に立ったか |
| `outcome_type` | 実際の結果分類 |
| `actual_outcome_note` | 実際にどうなったかのメモ |
| `user_correction` | ユーザーによる補足・訂正 |

注意:

`analysis_feedbacks` はファインチューニング用の正解ラベルではない。

ユーザーの主観を含むため、絶対的な正解として扱わない。

プロダクト改善、プロンプト改善、人物傾向要約の参考データとして扱う。

### `person_profiles`

Personごとの「いつもの傾向」を保存するテーブル。

毎回すべての過去相談本文をAIに渡すのではなく、必要な要約だけを使うためにある。

主なカラム:

| カラム | 意味 |
| --- | --- |
| `id` | Person Profile ID |
| `user_id` | 所有ユーザー |
| `person_id` | 対象Person |
| `profile_schema_version` | Profile JSONの構造バージョン |
| `profile_json` | Personごとの傾向要約 |
| `source_case_count` | 要約生成に使ったケース数 |
| `last_generated_at` | 最終生成日時 |

保存する内容の例:

- 普段の返信の長さ
- 普段のトーン
- 絵文字の使用傾向
- 悪く見すぎなくてよい根拠
- AIに渡すと役立つ文脈

注意:

`persons.notes` はユーザーが直接書くメモ。

`person_profiles.profile_json` はシステムが生成・更新するAI用の傾向要約。

### `user_pattern_summaries`

ユーザー自身の不安傾向を保存するテーブル。

これは心理診断ではない。

利用履歴から見える傾向として扱う。

主なカラム:

| カラム | 意味 |
| --- | --- |
| `id` | User Pattern Summary ID |
| `user_id` | 所有ユーザー |
| `summary_schema_version` | Summary JSONの構造バージョン |
| `summary_json` | ユーザー自身の傾向要約 |
| `source_case_count` | 要約生成に使ったケース数 |
| `last_generated_at` | 最終生成日時 |

保存する内容の例:

- 不安になりやすい条件
- 短文返信を悪く解釈しやすい傾向
- 役立った行動
- 振り返りから見えるパターン

注意:

「あなたは〇〇障害です」のような診断風表現に使わない。

UIでは「利用履歴から見える傾向」として表示する。

### `_prisma_migrations`

Prismaがmigration適用履歴を管理するテーブル。

アプリの業務データではない。

手動で編集しない。

`npm run prisma:migrate:status` はこのテーブルを見て、どのmigrationが適用済みか判断する。

---

## 16. メンバー共有用 作るべきAPI一覧（仮）

### 前提

このAPI一覧は仮案。

DB設計はSupabase Auth前提なので、API実装時は `X-Session-Id` ベースではなく、Supabase Authの認証済みユーザーを使う。

旧仕様書にはMVP用の `/api/sessions` や `X-Session-Id` が残っているが、現在のDB方針では次を守る。

- 認証はSupabase Authに任せる。
- アプリ側で自前の `users` / `auth_sessions` を作らない。
- クライアントから `user_id` を送らせない。
- backend側で認証済みユーザーIDを取得し、DB条件に含める。
- 他人のリソースIDは `404 RESOURCE_NOT_FOUND` として扱う。
- 業務データを `localStorage` に保存しない。

### 共通ルール

すべての保護APIは認証必須。

クライアントは `user_id` を送らない。

DBアクセスでは必ず `user_id = 認証済みユーザーID` を条件に含める。

一覧APIは、最初から `limit` / `offset` または cursor を受けられる形にする。

エラー形式は既存の共通エラー形式に寄せる。

```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "対象が見つかりません。",
    "status": 404
  }
}
```

### 優先度A: MVPで先に必要なAPI

| Method | Path | 目的 | 対応テーブル | 優先度 |
| --- | --- | --- | --- | --- |
| `GET` | `/api/me` | ログイン中ユーザー確認 | Supabase Auth | A |
| `POST` | `/api/persons` | Person作成 | `persons` | A |
| `GET` | `/api/persons` | 自分のPerson一覧 | `persons` | A |
| `GET` | `/api/persons/:personId` | Person詳細 | `persons` | A |
| `PATCH` | `/api/persons/:personId` | Person更新 | `persons` | A |
| `POST` | `/api/persons/:personId/archive` | Personアーカイブ | `persons` | A |
| `POST` | `/api/analysis-cases` | 相談ケース作成 | `analysis_cases` | A |
| `GET` | `/api/analysis-cases/:caseId` | 相談ケース詳細 | `analysis_cases` | A |
| `GET` | `/api/persons/:personId/analysis-cases` | Person別相談履歴 | `analysis_cases` | A |
| `POST` | `/api/analysis-cases/:caseId/analyze` | AI解析実行 | `analysis_cases`, `analysis_results` | A |
| `GET` | `/api/analysis-cases/:caseId/results/latest` | 最新解析結果取得 | `analysis_results` | A |

### 優先度B: 差別化機能として必要なAPI

| Method | Path | 目的 | 対応テーブル | 優先度 |
| --- | --- | --- | --- | --- |
| `GET` | `/api/analysis-cases/:caseId/results` | 解析結果履歴取得 | `analysis_results` | B |
| `POST` | `/api/analysis-results/:resultId/feedback` | Feedback作成 | `analysis_feedbacks` | B |
| `GET` | `/api/analysis-results/:resultId/feedback` | Feedback取得 | `analysis_feedbacks` | B |
| `PATCH` | `/api/analysis-feedbacks/:feedbackId` | Feedback更新 | `analysis_feedbacks` | B |
| `GET` | `/api/persons/:personId/profile` | Person Profile取得 | `person_profiles` | B |
| `POST` | `/api/persons/:personId/profile:regenerate` | Person Profile再生成 | `person_profiles` | B |
| `GET` | `/api/user-pattern-summary` | ユーザー傾向要約取得 | `user_pattern_summaries` | B |
| `POST` | `/api/user-pattern-summary:regenerate` | ユーザー傾向要約再生成 | `user_pattern_summaries` | B |
| `DELETE` | `/api/user-pattern-summary` | ユーザー傾向要約削除 | `user_pattern_summaries` | B |

### 優先度C: 運用・復旧・補助API

| Method | Path | 目的 | 対応テーブル | 優先度 |
| --- | --- | --- | --- | --- |
| `POST` | `/api/internal/analysis-cases/recover-stale` | stale analyzing復旧 | `analysis_cases` | C |
| `GET` | `/api/health` | サーバー疎通確認 | なし | C |
| `GET` | `/api/health/db` | DB接続確認 | なし | C |

`/api/internal/*` は外部ユーザー向けAPIではない。

実装する場合は管理者権限、cron、またはサーバー内部処理として扱う。

### API詳細案: `GET /api/me`

ログイン中ユーザーを確認するAPI。

Supabase AuthのJWTを検証し、ユーザーIDを返す。

Response案:

```json
{
  "user": {
    "id": "uuid"
  }
}
```

注意:

パスワード、refresh token、secret keyは返さない。

### API詳細案: `POST /api/persons`

Personを作成するAPI。

Request body案:

```json
{
  "displayName": "上司A",
  "relationshipType": "boss",
  "ageRange": "30s",
  "genderHint": "unknown",
  "notes": "普段から短文が多い"
}
```

保存時にbackend側で `user_id` を入れる。

Response案:

```json
{
  "person": {
    "id": "uuid",
    "displayName": "上司A",
    "relationshipType": "boss",
    "ageRange": "30s",
    "genderHint": "unknown",
    "notes": "普段から短文が多い",
    "createdAt": "2026-05-15T00:00:00.000Z",
    "updatedAt": "2026-05-15T00:00:00.000Z"
  }
}
```

### API詳細案: `GET /api/persons`

自分のPerson一覧を返すAPI。

Query案:

| Query | 意味 |
| --- | --- |
| `limit` | 取得件数 |
| `offset` | 開始位置 |
| `includeArchived` | アーカイブ済みも含めるか |

基本は `archived_at IS NULL` のPersonだけ返す。

### API詳細案: `GET /api/persons/:personId`

Person詳細を返すAPI。

DB検索条件:

```text
id = personId
AND user_id = 認証済みユーザーID
```

見つからない場合は、存在しない場合も他人のPersonの場合も `404 RESOURCE_NOT_FOUND`。

### API詳細案: `PATCH /api/persons/:personId`

Personを更新するAPI。

更新可能候補:

- `displayName`
- `relationshipType`
- `ageRange`
- `genderHint`
- `notes`

注意:

過去の `analysis_cases.person_snapshot` は更新しない。

### API詳細案: `POST /api/persons/:personId/archive`

PersonをアーカイブするAPI。

物理削除ではなく `archived_at` に現在時刻を入れる。

Response案:

```json
{
  "person": {
    "id": "uuid",
    "archivedAt": "2026-05-15T00:00:00.000Z"
  }
}
```

### API詳細案: `POST /api/analysis-cases`

相談ケースを作成するAPI。

Request body案:

```json
{
  "personId": "uuid",
  "eventFacts": "資料を送ったあと、相手から『確認します』だけ返ってきた",
  "selfMessage": "資料をお送りします。ご確認お願いします。",
  "partnerMessage": "確認します",
  "recentConversationText": "",
  "appType": "LINE",
  "userEmotion": "不安",
  "assumedPartnerEmotion": "怒っているかもしれない",
  "partnerSpeakingStyle": "普段から短文",
  "contextNote": "締切前",
  "concernText": "冷たく見える",
  "emojiUsed": false,
  "toneType": "formal",
  "messageLengthType": "short"
}
```

保存時にやること:

- 認証済みユーザーの `user_id` を入れる。
- `personId` が自分のPersonか確認する。
- `person_snapshot` に作成時点のPerson情報を保存する。
- 初期 `status` は `draft`。

他人の `personId` は `404 RESOURCE_NOT_FOUND`。

### API詳細案: `GET /api/analysis-cases/:caseId`

相談ケース詳細を返すAPI。

DB検索条件:

```text
id = caseId
AND user_id = 認証済みユーザーID
```

必要に応じて最新結果を含めるかは実装時に決める。

含める場合でも、最新結果は `version DESC` で取得する。

### API詳細案: `GET /api/persons/:personId/analysis-cases`

Personごとの相談履歴を返すAPI。

Query案:

| Query | 意味 |
| --- | --- |
| `limit` | 取得件数 |
| `offset` | 開始位置 |
| `status` | `draft`, `analyzing`, `analyzed`, `failed` で絞る |

他人の `personId` は `404 RESOURCE_NOT_FOUND`。

### API詳細案: `POST /api/analysis-cases/:caseId/analyze`

AI解析を実行するAPI。

処理の流れ:

1. `caseId` と認証済み `user_id` で相談ケースを探す。
2. `status IN ('draft', 'failed')` の場合だけ開始できる。
3. `status` を `analyzing` にする。
4. `analyze_run_id` を発行する。
5. AIに必要最小限の入力を渡す。
6. 成功したら `analysis_results` に新しい `version` で保存する。
7. `analysis_cases.status` を `analyzed` にする。
8. 失敗したら `failed` と `failure_code` / `failure_message` を保存する。

注意:

二重実行や古いAI実行の戻りで壊れないように `analyze_run_id` を使う。

### API詳細案: `GET /api/analysis-cases/:caseId/results/latest`

ケースの最新解析結果を返すAPI。

最新判定:

```sql
ORDER BY version DESC
LIMIT 1
```

`created_at DESC` は使わない。

Response案:

```json
{
  "result": {
    "id": "uuid",
    "analysisCaseId": "uuid",
    "version": 1,
    "promptVersion": "v1",
    "resultSchemaVersion": "kigen-analysis-result-v2",
    "model": "gpt-5.4-nano",
    "resultJson": {}
  }
}
```

### API詳細案: `GET /api/analysis-cases/:caseId/results`

解析結果履歴を返すAPI。

用途:

- 再解析履歴を見る
- promptやmodel変更後の結果を比較する

並び順:

```sql
ORDER BY version DESC
```

### API詳細案: `POST /api/analysis-results/:resultId/feedback`

AI解析結果へのフィードバックを作成するAPI。

Request body案:

```json
{
  "wasHelpful": true,
  "outcomeType": "seemed_correct",
  "actualOutcomeNote": "実際には相手は忙しかっただけだった",
  "userCorrection": "怒っていると決めつけすぎた"
}
```

他人の `resultId` は `404 RESOURCE_NOT_FOUND`。

1つの `analysis_result` に対してフィードバックは1件まで。

### API詳細案: `GET /api/analysis-results/:resultId/feedback`

解析結果に紐づくフィードバックを返すAPI。

フィードバックが未作成の場合は、対象結果が存在するなら `feedback: null` を返す案。

他人の `resultId` は `404 RESOURCE_NOT_FOUND`。

### API詳細案: `PATCH /api/analysis-feedbacks/:feedbackId`

フィードバックを更新するAPI。

更新可能候補:

- `wasHelpful`
- `outcomeType`
- `actualOutcomeNote`
- `userCorrection`

他人の `feedbackId` は `404 RESOURCE_NOT_FOUND`。

### API詳細案: `GET /api/persons/:personId/profile`

Person Profileを取得するAPI。

Profileが存在しない場合は、対象Personが自分のものなら `profile: null` を返す案。

他人の `personId` は `404 RESOURCE_NOT_FOUND`。

### API詳細案: `POST /api/persons/:personId/profile:regenerate`

Person Profileを再生成するAPI。

処理の候補:

1. 自分のPersonか確認する。
2. 対象Personの過去相談を必要な範囲だけ取得する。
3. `analysis_results.result_json` や `analysis_feedbacks` を参考にする。
4. `person_profiles.profile_json` を作成または更新する。

注意:

過去相談本文を無制限にAIへ渡さない。

必要な件数・要約済み情報に絞る。

### API詳細案: `GET /api/user-pattern-summary`

ログイン中ユーザー自身の傾向要約を返すAPI。

存在しない場合は `summary: null` を返す案。

心理診断として返してはいけない。

### API詳細案: `POST /api/user-pattern-summary:regenerate`

ユーザー自身の傾向要約を再生成するAPI。

処理の候補:

1. 認証済みユーザーの相談履歴を必要範囲だけ取得する。
2. フィードバックも必要範囲だけ参照する。
3. `user_pattern_summaries.summary_json` を作成または更新する。

注意:

診断風表現を避ける。

利用履歴から見える傾向として扱う。

### API詳細案: `DELETE /api/user-pattern-summary`

ユーザー傾向要約を削除するAPI。

ユーザーが自分の傾向要約を消せる導線として使う。

相談本文やAI解析結果は削除しない。

### API詳細案: `POST /api/internal/analysis-cases/recover-stale`

`analyzing` のまま止まった相談ケースを `failed` に戻す内部API。

外部ユーザー向けではない。

cronまたは管理者だけが実行できる形にする。

復旧条件案:

```sql
status = 'analyzing'
AND analyze_started_at < now() - interval '5 minutes'
```

### API実装順序案

最初はこの順番で作る。

1. Supabase Authから認証済みユーザーIDを取るmiddleware
2. `GET /api/me`
3. `POST /api/persons`
4. `GET /api/persons`
5. `POST /api/analysis-cases`
6. `POST /api/analysis-cases/:caseId/analyze`
7. `GET /api/analysis-cases/:caseId/results/latest`
8. `GET /api/persons/:personId/analysis-cases`
9. Feedback系API
10. Person Profile系API
11. User Pattern Summary系API

最初に認証middlewareを作る理由は、すべてのDB操作で `user_id` 条件が必要だから。

### API実装時のチェックリスト

- [ ] クライアントから `user_id` を受け取っていない。
- [ ] Supabase Authの認証済みユーザーIDを使っている。
- [ ] すべてのDB queryに `user_id` 条件がある。
- [ ] 他人のIDは `404 RESOURCE_NOT_FOUND` を返す。
- [ ] 最新解析結果は `version DESC` で取得している。
- [ ] `created_at DESC` を最新判定に使っていない。
- [ ] Service Role Keyをfrontendに出していない。
- [ ] 相談本文や人物メモを `localStorage` に保存していない。
- [ ] ログに相談本文全文やAPI keyを出していない。
