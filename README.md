# 相手の機嫌・感情傾向分析 AI Web アプリ

ユーザーが入力した出来事・会話文・補足情報をもとに、
**相手の機嫌・感情傾向・温度感を、ポジティブ／ネガティブの両面から分析する AI Web アプリ**です。

このアプリは、ただ「怒っていそう」と決めつけるのではなく、

- 本当に怒っている可能性
- 忙しいだけの可能性
- そっけないだけの可能性
- ポジティブに受け取っている可能性
- 今どう動くのがよいか

を分けて見られることを目的にしています。

---

## 背景

メッセージアプリや SNS で短い返事が来たときに、
「怒っているのではないか」「冷たくされたのではないか」「距離を置かれているのではないか」と不安になることがあります。

しかし実際には、相手が忙しいだけだったり、もともと短文の人だったり、返信を急いでいないだけだったり、そのとき置かれている状況に余裕がないだけだったりすることも多く、ユーザーの不安と実際の状態が一致しているとは限りません。

また、人とのやりとりを考えるときは、現実で起こったことと、チャット上で交わされた文面を分けて考えることが重要です。
現実では何も問題が起きていなくても、文面だけを見ると冷たく感じることがあります。
逆に、文面はやわらかく見えても、実際の出来事や関係性を踏まえると別の受け取り方をしたほうがよい場合もあります。

このアプリでは、出来事・会話文・関係性・背景情報をまとめて入力し、AI がそれぞれを整理したうえで見立てを返します。
そのことで、ユーザーが文面だけで悪い方向に決めつけすぎることを防ぎ、今の状況に対してより適した考え方や行動のヒントを、できるだけ早く得られることを目指しています。

また、分析対象は怒りや不機嫌だけでなく、喜び・安心・前向きさといったポジティブな可能性も含みます。

---

## このアプリでできること

### 1. 相手情報の登録

分析対象となる相手を登録できます。

例:

- 上司
- 恋人
- 家族
- 友人
- 同級生
- 顧客

### 2. 相談内容の入力

1件の相談ごとに、以下のような情報をまとめて入力できます。

- 実際に何があったか
- 自分が送った文
- 相手が返した文
- 直前の会話
- 利用アプリの種類
- 相手の普段の話し方
- 背景事情
- 自分の不安や気になっていること

### 3. AI による分析

入力内容をもとに、AI が次のような結果を返します。

- 文面から見える印象
- 状況込みで見た印象
- 感情スコア
- 確信度
- 連絡のタイミング
- 今取るべき行動
- 避けるべき表現
- ポジティブに見える要素
- 返信例

### 4. 人物ごとの履歴確認

同じ相手に対して複数の相談ケースを持てるため、  
人物ごとの履歴一覧も確認できます。

---

## 特徴

- **フォーム入力型**  
  チャット形式ではなく、必要な情報を項目ごとに整理して入力します。  
  そのため、AI に渡る情報が安定しやすいです。

- **ネガティブ決め打ちをしない**  
  「怒っているかも」だけでなく、「忙しいだけかも」「好意的かも」も返します。

- **ハッカソン向け MVP 設計**  
  まずは確実に動くことを優先し、ログインや OCR などは後回しにしています。

- **同じ相手に対して複数ケースを管理できる**  
  1 人物に対して何件も相談を積み重ねられます。

---

## 想定ユーザー

- 返信の温度感に不安を感じやすい人
- 上司や先輩とのやりとりに気を使う人
- 恋人や友人とのやりとりを慎重に考えたい人
- 自分の主観だけで判断せず、一度整理して考えたい人

---

## MVP の範囲

### 実装するもの

- セッション作成
- 人物作成
- AnalysisCase 作成
- AI 分析実行
- 分析結果取得
- 人物別ケース一覧取得

### 今回は実装しないもの

- ログイン機能
- 人物更新 API
- AnalysisCase 更新 API
- 再分析専用 API
- OCR 本実装
- 高度な個人情報マスキング
- promptVersion の高度運用

---

## 画面の流れ

このアプリは、基本的に次の流れで使います。

1. 初回アクセス
2. セッション作成
3. 相手情報の入力
4. 相談内容の入力
5. AI 分析の実行
6. 結果表示
7. 必要に応じて履歴を見る

設計上の操作フローは、  
**フォーム入力 → AI 分析 → 結果表示** です。

---

## AI が見る主な入力情報

AI は、主に以下の情報を使って分析します。

| フィールド               | 内容                             |
| ------------------------ | -------------------------------- |
| `eventFacts`             | 実際に何があったか               |
| `selfMessage`            | 自分が送った文                   |
| `partnerMessage`         | 相手が返した文                   |
| `recentConversationText` | 直前の会話                       |
| `appType`                | LINE / Slack / Instagram DM など |
| `userEmotion`            | 相談者の感情                     |
| `assumedPartnerEmotion`  | 相手の感情予想                   |
| `partnerSpeakingStyle`   | 相手の普段の話し方               |
| `contextNote`            | 背景事情                         |
| `concernText`            | 不安に思っていること             |
| `emojiUsed`              | 絵文字の有無                     |
| `toneType`               | 文体                             |
| `messageLengthType`      | 文の長さ傾向                     |

---

## AI が返す主な結果

| フィールド          | 内容                   |
| ------------------- | ---------------------- |
| `textImpression`    | 文面から見える印象     |
| `contextImpression` | 状況込みで見た印象     |
| `scores.angry`      | 怒りスコア             |
| `scores.busy`       | 忙しさスコア           |
| `scores.justCold`   | そっけなさスコア       |
| `scores.positive`   | ポジティブスコア       |
| `scores.distance`   | 距離感スコア           |
| `confidenceLevel`   | 確信度                 |
| `contactTiming`     | 連絡のタイミング       |
| `actions`           | 今取るべき行動         |
| `avoidExpressions`  | 避けるべき表現         |
| `goodSignals`       | ポジティブに見える要素 |
| `replyExamples`     | 返信例                 |
| `reasons`           | 判断の根拠             |

---

## API 一覧

| 機能             | エンドポイント                          | メソッド | 用途                    |
| ---------------- | --------------------------------------- | -------- | ----------------------- |
| セッション作成   | `/api/sessions`                         | POST     | sessionId の発行        |
| 人物作成         | `/api/persons`                          | POST     | 分析対象人物の保存      |
| ケース作成       | `/api/analysis-cases`                   | POST     | AnalysisCase の新規作成 |
| AI 分析実行      | `/api/analysis-cases/:caseId/analyze`   | POST     | AI 分析の開始           |
| 分析結果取得     | `/api/analysis-cases/:caseId/results`   | GET      | 最新分析結果取得        |
| 人物別ケース一覧 | `/api/persons/:personId/analysis-cases` | GET      | 人物ごとのケース一覧    |

---

## セッション仕様

このアプリでは、MVP ではログインではなく **sessionId** を使って利用者を識別します。

### ルール

- `POST /api/sessions` を除く全 API で `X-Session-Id` が必須
- `sessionId` はフロント側で `localStorage` に保存
- 有効期限は 24 時間
- 無効・期限切れ時は `401 SESSION_INVALID`
- これは本番認証ではなく、**ハッカソン向けの簡易識別方式**です

```http
X-Session-Id: sess_xxxxxxxxx
```

---

## エラー形式

エラーはすべて次の形式に統一しています。

```json
{
    "error": {
        "code": "NOT_FOUND",
        "message": "指定されたリソースが存在しません",
        "status": 404
    }
}
```

主なエラーコード:

| コード              | 意味                                 | HTTP ステータス |
| ------------------- | ------------------------------------ | --------------- |
| `SESSION_INVALID`   | sessionId が無効・不存在・期限切れ   | 401             |
| `FORBIDDEN`         | 他セッションのリソースにアクセスした | 403             |
| `NOT_FOUND`         | person / case が存在しない           | 404             |
| `ALREADY_ANALYZING` | 分析中に再度 analyze を叩いた        | 409             |
| `ALREADY_ANALYZED`  | 分析済みのケースに analyze を叩いた  | 409             |
| `VALIDATION_ERROR`  | 入力バリデーション失敗               | 422             |
| `AI_TIMEOUT`        | AI API タイムアウト                  | 503             |
| `INTERNAL_ERROR`    | サーバー内部エラー                   | 500             |

---

## 状態管理

1件の相談ケースは、次の状態を持ちます。

- `draft`
- `analyzing`
- `analyzed`
- `error`

### 状態遷移

```txt
draft     ──[analyze 開始]────→ analyzing
analyzing ──[analyze 成功]────→ analyzed
analyzing ──[analyze 失敗]────→ error
error     ──[analyze 再実行]──→ analyzing
```

フロント側では、状態に応じて「未分析 / 分析中 / 分析済み / 分析失敗」を表示し分ける想定です。

---

## 想定ディレクトリ構成

```txt
src/
├─ app.ts
├─ server.ts
├─ routes/
│   ├─ sessions.routes.ts
│   ├─ persons.routes.ts
│   └─ analysisCases.routes.ts
├─ controllers/
│   ├─ sessions.controller.ts
│   ├─ persons.controller.ts
│   └─ analysisCases.controller.ts
├─ services/
│   ├─ sessions.service.ts
│   ├─ persons.service.ts
│   └─ analysisCases.service.ts
├─ repositories/
│   ├─ sessions.repository.ts
│   ├─ persons.repository.ts
│   ├─ analysisCases.repository.ts
│   └─ analysisResults.repository.ts
├─ middlewares/
│   ├─ requireSession.ts
│   └─ errorHandler.ts
├─ ai/
│   └─ analyze.ts
├─ types/
│   └─ index.ts
└─ utils/
    └─ index.ts
```

それぞれの役割は、ルーティング・API 入口処理・業務ロジック・DB 操作・共通 middleware・AI 通信処理・型定義・共通関数に分ける設計です。

---

## 使用技術

### フロントエンド

- vite
- react
- TypeScript

### バックエンド

- Node.js
- TypeScript

---

## ローカルでの起動イメージ

### 1. 依存関係をインストール

```bash
npm install
```

### 2. 環境変数を設定

`.env` の例:

```env
PORT=8080
AI_API_KEY=your_api_key_here
DATABASE_URL=your_database_url_here
NODE_ENV=development
```

### 3. 開発サーバーを起動

```bash
npm run dev
```

または

```bash
npm run server
```

> 実際にどちらを使うかは、このリポジトリの `package.json` に合わせてください。

### Docker Composeで開発する

Dockerではフロントエンド（Vite、`5173`）とバックエンド（Express、`3000`）のみを起動します。
Supabase AuthとPostgreSQLは外部サービスをそのまま利用します。

初めてセットアップする場合は、[Docker開発環境セットアップ](docs/docker-development-setup.md)を参照してください。

`.env.local`に既存のローカル開発用環境変数を設定してから起動してください。
Composeの変数展開には同じファイルを指定しますが、フロントエンドへ渡すのは公開用の
`VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY`と`VITE_SERVER_URL`だけです。

```bash
docker compose --env-file .env.local up --build -d
```

起動後は、フロントエンドを `http://localhost:5173`、バックエンドのヘルスチェックを
`http://localhost:3000/health` で確認できます。

```bash
# ログを確認する
docker compose logs -f

# 停止する
docker compose down

# 依存関係の変更後にnode_modulesを作り直す
docker compose down -v
docker compose --env-file .env.local up --build -d
```

Prisma migrationはコンテナ起動時には自動実行されません。必要なときだけ明示的に実行します。

```bash
docker compose run --rm backend npm run prisma:migrate:deploy
```

既存テストもバックエンドコンテナから実行できます。

```bash
docker compose run --rm backend npm test
```

---

## 動作確認例

### セッション作成

```bash
curl -X POST http://localhost:8080/api/sessions
```

### 人物作成

```bash
curl -X POST http://localhost:8080/api/persons \
  -H "Content-Type: application/json" \
  -H "X-Session-Id: sess_xxx" \
  -d '{
    "displayName": "上司A",
    "relationshipType": "boss"
  }'
```

### ケース作成

```bash
curl -X POST http://localhost:8080/api/analysis-cases \
  -H "Content-Type: application/json" \
  -H "X-Session-Id: sess_xxx" \
  -d '{
    "personId": "person_xxx",
    "eventFacts": "資料を送ったあと、相手から確認しますだけ返ってきた",
    "selfMessage": "資料をお送りします。ご確認お願いします。",
    "partnerMessage": "確認します。"
  }'
```

### 分析実行

```bash
curl -X POST http://localhost:8080/api/analysis-cases/case_xxx/analyze \
  -H "Content-Type: application/json" \
  -H "X-Session-Id: sess_xxx" \
  -d '{}'
```

### 結果取得

```bash
curl -X GET http://localhost:8080/api/analysis-cases/case_xxx/results \
  -H "X-Session-Id: sess_xxx"
```

---

## デプロイ時の確認項目

- [ ] 環境変数が設定されている
- [ ] `AI_API_KEY` が本番環境に設定されている
- [ ] `POST /api/sessions` が成功する
- [ ] `POST /api/persons` が成功する
- [ ] `POST /api/analysis-cases` が成功する
- [ ] `POST /api/analysis-cases/:caseId/analyze` が成功する
- [ ] エラー時に共通形式で返る
- [ ] ログに API キーや個人情報が出ていない

---

## 今後の拡張候補

- ログイン機能
- 人物更新 API
- AnalysisCase 更新 API
- 再分析専用 API
- OCR 取り込み
- 複数端末同期
- promptVersion 比較機能
- 関係性別の出力最適化
- 本番向け認証・セキュリティ強化

---

## 注意事項

- このアプリは、**相手の感情を断定するものではありません。**
- AI の出力はあくまで参考情報であり、実際の人間関係や状況判断を完全に代替するものではありません。
- MVP では sessionId を用いた簡易識別方式を採用しているため、本番公開時には正式な認証方式への変更が必要です。

---

## 開発方針

このプロジェクトでは、MVP 段階では次のことを重視しています。

- ハッカソン中に確実に動くこと
- フロント実装が迷わないこと
- 必須入力を最小限にすること
- 結果を見せる体験を最優先にすること
- 悪い反応だけでなく、良い反応も返せること

---

## まとめ

このアプリは、  
**「相手の返信を悪い方向に決めつけすぎないために、一度情報を整理して AI に見立ててもらう」**  
ための Web アプリです。

短い返事やそっけない文面に対して、  
怒り・忙しさ・距離感・ポジティブ要素を分けて見られるようにすることで、  
ユーザーが次の行動を落ち着いて考えられる体験を目指しています。
