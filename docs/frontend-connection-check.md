# フロント接続前チェック

## 1. 今のバックエンドで使える API

2026-03-27 JST 時点で、フロント接続に必要な 6 API は実装されています。

| API | 実装 | ルート接続 | フロントから叩ける前提 | 主な注意 |
| --- | --- | --- | --- | --- |
| `POST /api/sessions` | あり | `src/backend/server.ts` -> `sessions.routes.ts` | はい | 仕様書向けの `sessionId` を返しつつ、旧 `session` も残しています |
| `POST /api/persons` | あり | `src/backend/server.ts` -> `persons.routes.ts` | はい | `X-Session-Id` 必須です |
| `POST /api/analysis-cases` | あり | `src/backend/server.ts` -> `analysisCases.routes.ts` | はい | `selfMessage`, `partnerMessage` も必須になりました |
| `POST /api/analysis-cases/:caseId/analyze` | あり | `src/backend/server.ts` -> `analysisCases.routes.ts` | はい | `result.id` などのメタ情報も返ります |
| `GET /api/analysis-cases/:caseId/results` | あり | `src/backend/server.ts` -> `analysisCases.routes.ts` | はい | `result.id`, `analysisCaseId`, `generatedAt` が返ります |
| `GET /api/persons/:personId/analysis-cases` | あり | `src/backend/server.ts` -> `persons.routes.ts` | はい | 一覧の返り値はまだ詳細形です |

### 補足

- `POST /api/sessions` 以外は `requireSession` middleware を通ります
- `X-Session-Id` が無い、無効、期限切れのときは `401 SESSION_INVALID` です
- `analyze` は OpenAI 依存ですが、現ブランチで実動確認できています

## 2. 仕様書との対応表

| 観点 | 仕様書 | 現在実装 | 判定 |
| --- | --- | --- | --- |
| API の有無 | 6 API 必須 | 6 API 実装済み | 完全一致 |
| API の URL | 仕様書どおり | 仕様書どおり | 完全一致 |
| `X-Session-Id` の扱い | `POST /api/sessions` 以外で必須 | そのとおり | 完全一致 |
| status 遷移 | `draft -> analyzing -> analyzed/error` | そのとおり | 完全一致 |
| `ALREADY_ANALYZED (409)` | analyze 済み case に返す | そのとおり | 完全一致 |
| `SESSION_INVALID (401)` | session 不正で返す | そのとおり | 完全一致 |
| person 所有チェック | 他 session の person は不可 | そのとおり | 完全一致 |
| MVP 優先範囲 | 6 API を優先 | 6 API 実装済み | 完全一致 |
| `POST /api/sessions` レスポンス | `{ sessionId, expiresAt }` | その shape を返す。後方互換で `session` も残す | 大筋一致 |
| `POST /api/analysis-cases` body | `personId`, `eventFacts`, `selfMessage`, `partnerMessage` などが必要 | 主要必須項目を追加済み | 大筋一致 |
| `emojiUsed` | boolean 前提 | boolean へ正規化。旧 `あり / なし` も受ける | 大筋一致 |
| `toneType`, `messageLengthType` | enum 想定 | enum へ正規化。旧日本語値も受ける | 大筋一致 |
| analyze / results の `result` 形 | `id`, `analysisCaseId`, `generatedAt` を含む | 追加済み。`promptVersion: "v1"` も返す | 大筋一致 |
| analyze / results の `scores` 形 | 8 ラベルで扱いたい | `angry`, `cold`, `busy`, `pressure`, `distance`, `happy`, `joy`, `relief` | 完全一致 |
| 一覧 API のレスポンス | 最小形 | まだ詳細形 | 未一致 |
| エラーコード | `INTERNAL_ERROR` など | `INTERNAL_SERVER_ERROR`, `AI_PROVIDER_ERROR` などもある | 未一致 |

### 仕様との差分がどう減ったか

1. `POST /api/sessions` は、フロントがそのまま使いやすい `sessionId` を受け取れるようになりました
2. `POST /api/analysis-cases` は、仕様書で重要な `selfMessage` と `partnerMessage` も必須になりました
3. `emojiUsed` は boolean に寄せました
4. `toneType` と `messageLengthType` は enum に寄せました
5. analyze と results の `result` に、識別用のメタ情報が付きました
6. `result.scores` は frontend と同じ 8 ラベルになりました

## 3. フロントから叩く順番

### 初回利用

1. `POST /api/sessions`
2. `sessionId` を保存する
3. `POST /api/persons`
4. `person.id` を保存する
5. `POST /api/analysis-cases`
6. `analysisCase.id` を保存する
7. `POST /api/analysis-cases/:caseId/analyze`
8. `GET /api/analysis-cases/:caseId/results`

### 履歴を見るとき

1. `GET /api/persons/:personId/analysis-cases`
2. 必要な `analysisCase.id` を選ぶ
3. `GET /api/analysis-cases/:caseId/results`

### `401 SESSION_INVALID` を受けたとき

1. `POST /api/sessions` を呼び直す
2. 新しい `sessionId` を保存する
3. 古い `personId` と `analysisCaseId` は引き継げない前提で扱う
4. 必要なら人物選択、または入力開始画面に戻す

## 4. フロント側で保持する値

### 最低限持つもの

| 値 | 保存先 | 理由 |
| --- | --- | --- |
| `sessionId` | `localStorage` | 以後の全 protected API で必要です |
| 最後に開いていた `personId` | `localStorage` | 仕様書の方針に沿っています |

### 実務上は持っておくとよいもの

| 値 | 保存先 | 理由 |
| --- | --- | --- |
| 最後に開いていた `analysisCaseId` | `localStorage` | 結果画面の復元がしやすいです |
| 画面表示用の人物名 | `localStorage` または state | 一覧や戻る導線を作りやすいです |

### 今のフロント実装との関係

- 既存フロントは `consultations` などを `localStorage` に保存しています
- これは API 接続前のローカル完結用データです
- 接続後は、サーバーの `personId` と `analysisCaseId` を別で保持する方が混乱しにくいです

## 5. 今の実装で融合できる範囲

### すぐに融合できる範囲

- session 発行
- person 作成
- analysis-case 作成
- analyze 実行
- result 取得
- person ごとの case 一覧

### フロント側で変換が必要な範囲

- `GET /api/persons/:personId/analysis-cases` の詳細形レスポンスを、表示用 shape へ整える処理
- `POST /api/analysis-cases` の作成レスポンスを、表示用 shape へ整える処理
- `result.scores` は backend で 8 ラベル返却されるので、そのままレーダーチャートへ流しやすいです
- `401`, `409`, `503` の画面分岐

### まだ完全にはそろっていない範囲

- 一覧 API の最小 shape への統一
- 仕様書どおりの全項目 length 制限
- 永続 DB 保存

## 6. つまずきやすい点

1. 新しいフロントは `sessionId` を使えばよいですが、レスポンスには後方互換の `session.id` も残っています
2. `POST /api/sessions` 以外は `X-Session-Id` を付け忘れると `401 SESSION_INVALID` です
3. サーバー再起動でメモリ上のデータが消えるので、保存済み ID が急に無効になることがあります
4. `POST /api/analysis-cases` の `emojiUsed` は boolean 推奨ですが、旧 `あり / なし` も受けます
5. `toneType` は `formal / casual / mixed / unknown`、`messageLengthType` は `short / normal / long / unknown` を使うのが安全です
6. 後方互換として、`toneType: "事務的"` や `messageLengthType: "短め"` も今は受けますが、新しいフロントでは使わない方が分かりやすいです
7. `analyze` は同期処理なので、ボタン連打を防がないと `409 ALREADY_ANALYZING` や `409 ALREADY_ANALYZED` に当たりやすいです
8. 一覧 API の各 item は `eventFacts` が top-level ではなく `analysisCase.eventFacts` の位置にあります
9. `result.scores` のキーは `justCold` や `positive` ではなく、`cold / pressure / happy / joy / relief` を含む 8 ラベルです

## 7. 結論

今のバックエンドは、MVP としてフロント接続を始める準備が前より整いました。

特に、

- session のレスポンス
- analysis-case の必須入力
- `emojiUsed`
- `toneType`
- `messageLengthType`
- analyze / results の `result` shape
- `result.scores` の 8 ラベル化

は、フロントが扱いやすい方向へ寄っています。

一方で、まだ残っている差分はあります。

- 一覧 API の返り値はまだ詳細形です
- 内部エラーコードの名前は仕様書と完全一致ではありません
- 一部の細かい文字数制限は、まだ仕様書ほど厳密ではありません

そのため、結論としては、

- front/back 接続はかなり進めやすくなった
- ただし一覧 API だけは、まだ軽いマッピングが必要
- 新しいフロントは `sessionId`, boolean の `emojiUsed`, enum 化された `toneType / messageLengthType`, メタ情報付き `result` を前提に組むのがよい
- `result.scores` は `angry / cold / busy / pressure / distance / happy / joy / relief` 前提で扱えばよい
