# Backend Handover

## 1. まず押さえること

- このブランチ `feat/backend-mvp-complete` では、フロント接続に使う 6 API はそろっています
- 仕様差分のうち、フロント接続の邪魔になりやすい shape とバリデーションは最小限修正しました
- 最初に `POST /api/sessions` を呼び、返ってきた `sessionId` を以後の API の `X-Session-Id` に入れて使います
- 後方互換のため、`POST /api/sessions` では旧 `session.id` もまだ返します
- `analyze` は同期処理です。レスポンスが返るまでフロントはローディング表示にしてください
- データ保存は今もインメモリです。サーバー再起動で `session / person / analysis-case / result` は消えます

## 2. 今のバックエンドでフロント接続に使う API 一覧

| API | 実装状況 | フロントで必要なもの | 今の主な返り値 |
| --- | --- | --- | --- |
| `POST /api/sessions` | 実装済み | body なし、ヘッダーなし | `sessionId`, `expiresAt` |
| `POST /api/persons` | 実装済み | `X-Session-Id`, `displayName`, `relationshipType` | `person.id` を含む `person` |
| `POST /api/analysis-cases` | 実装済み | `X-Session-Id`, `personId`, `eventFacts`, `selfMessage`, `partnerMessage` | `analysisCase.id` を含む `analysisCase` |
| `POST /api/analysis-cases/:caseId/analyze` | 実装済み | `X-Session-Id`, URL の `caseId` | `status: "analyzed"` とメタ情報付き `result` |
| `GET /api/analysis-cases/:caseId/results` | 実装済み | `X-Session-Id`, URL の `caseId` | `status` とメタ情報付き `result` |
| `GET /api/persons/:personId/analysis-cases` | 実装済み | `X-Session-Id`, URL の `personId` | `analysisCases`, `pagination` |

## 3. フロントから叩く順番

### 基本フロー

1. 画面起動時に `localStorage` から `sessionId` を読む
2. `sessionId` が無ければ `POST /api/sessions` を呼ぶ
3. 返ってきた `sessionId` を `localStorage` に保存する
4. 人物登録時に `POST /api/persons` を呼び、返ってきた `person.id` を保持する
5. 相談内容送信時に `POST /api/analysis-cases` を呼び、返ってきた `analysisCase.id` を保持する
6. 分析ボタンで `POST /api/analysis-cases/:caseId/analyze` を呼ぶ
7. 詳細表示や再表示では `GET /api/analysis-cases/:caseId/results` を使う
8. 人物別の履歴画面では `GET /api/persons/:personId/analysis-cases` を使う

### `SESSION_INVALID (401)` を受けたとき

1. `POST /api/sessions` で新しい session を作る
2. `localStorage.sessionId` を更新する
3. 旧 session の `personId` と `analysisCaseId` はそのままでは使えない前提で扱う
4. 必要なら人物作成画面、または最初の入力画面へ戻す

## 4. `sessionId`, `personId`, `analysisCaseId` の扱い

### `sessionId`

- 最重要の ID です
- `POST /api/sessions` のレスポンスでは `sessionId` が top-level に入って返ります
- 後方互換で `session.id` も残っています
- 新しいフロントは `sessionId` を使う方が分かりやすいです

### `personId`

- `POST /api/persons` の成功レスポンスから取ります
- 相談作成の `POST /api/analysis-cases` で body に入れます
- 一覧画面の `GET /api/persons/:personId/analysis-cases` にも使います

### `analysisCaseId`

- `POST /api/analysis-cases` の成功レスポンスから取ります
- `POST /api/analysis-cases/:caseId/analyze` と `GET /api/analysis-cases/:caseId/results` に使います

## 5. localStorage に何を持つとよいか

### 最低限

| キー例 | 何を入れるか | 理由 |
| --- | --- | --- |
| `kanjo-navi-session-id` | `sessionId` | 全 protected API に必要です |
| `kanjo-navi-last-person-id` | 最後に使った `personId` | 仕様書の「最後に開いていた personId」に対応しやすいです |

### あると便利

| キー例 | 何を入れるか | 理由 |
| --- | --- | --- |
| `kanjo-navi-last-analysis-case-id` | 最後に見ていた `analysisCase.id` | 結果画面の再表示に使いやすいです |
| `kanjo-navi-last-person-name` | 表示用の人物名 | 画面復元がしやすくなります |

## 6. API の request / response

### `POST /api/sessions`

何をする API か:

- session を新しく作る API です

何を送るか:

- 何も送りません

何が返るか:

```json
{
  "sessionId": "sess_xxx",
  "expiresAt": "2026-03-28T03:35:19.861Z",
  "session": {
    "id": "sess_xxx",
    "expiresAt": "2026-03-28T03:35:19.861Z",
    "createdAt": "2026-03-27T03:35:19.861Z",
    "updatedAt": "2026-03-27T03:35:19.861Z"
  }
}
```

注意:

- 仕様書向けには `sessionId` を使えば十分です
- `session` は旧参照先を壊さないために残しています

### `POST /api/persons`

何をする API か:

- 分析したい相手を作る API です

必須ヘッダー:

- `X-Session-Id`

必須 body:

- `displayName`
- `relationshipType`

任意 body:

- `ageRange`
- `genderHint`
- `notes`

何が返るか:

- 作成された `person`
- その中に `person.id` が入ります

### `POST /api/analysis-cases`

何をする API か:

- 今回の相談内容を保存する API です

必須ヘッダー:

- `X-Session-Id`

必須 body:

- `personId`
- `eventFacts`
- `selfMessage`
- `partnerMessage`

推奨 body:

- `recentConversationText`
- `appType`
- `userEmotion`
- `assumedPartnerEmotion`
- `partnerSpeakingStyle`
- `contextNote`
- `concernText`
- `emojiUsed`
- `toneType`
- `messageLengthType`

今の推奨値:

- `emojiUsed`: `true` / `false`
- `toneType`: `formal` / `casual` / `mixed` / `unknown`
- `messageLengthType`: `short` / `normal` / `long` / `unknown`

後方互換で今も受ける値:

- `emojiUsed`: `あり` / `なし`
- `toneType`: `事務的` などの一部日本語表現
- `messageLengthType`: `短め` などの一部日本語表現

何が返るか:

- 作成された `analysisCase`
- その中に `analysisCase.id` が入ります

注意:

- 返り値はまだ詳細形です
- `analysisCase.analysisCase.emojiUsed` は boolean になります
- `analysisCase.analysisCase.toneType` は enum へ正規化されます
- `analysisCase.analysisCase.messageLengthType` も enum へ正規化されます

### `POST /api/analysis-cases/:caseId/analyze`

何をする API か:

- 指定した analysis-case に対して AI 分析を実行する API です

必須ヘッダー:

- `X-Session-Id`

何を送るか:

- URL の `caseId`

何が返るか:

```json
{
  "status": "analyzed",
  "result": {
    "id": "result_xxx",
    "analysisCaseId": "case_xxx",
    "promptVersion": "v1",
    "generatedAt": "2026-03-27T03:35:24.798Z",
    "textImpression": "...",
    "contextImpression": "...",
    "scores": {
      "angry": 0.08,
      "cold": 0.46,
      "busy": 0.82,
      "pressure": 0.18,
      "distance": 0.28,
      "happy": 0.34,
      "joy": 0.24,
      "relief": 0.31
    },
    "confidenceLevel": "medium",
    "contactTiming": "...",
    "actions": [{ "text": "..." }],
    "avoidExpressions": [{ "text": "..." }],
    "goodSignals": [{ "text": "..." }],
    "replyExamples": [{ "text": "...", "tone": "formal" }],
    "reasons": [{ "label": "...", "detail": "..." }]
  }
}
```

注意:

- すでに analyze 済みの case に対してもう一度呼ぶと `409 ALREADY_ANALYZED` になります
- 分析中なら `409 ALREADY_ANALYZING` です
- `result.scores` のキーは `angry / cold / busy / pressure / distance / happy / joy / relief` です

### `GET /api/analysis-cases/:caseId/results`

何をする API か:

- 保存済みの分析結果を取り出す API です

必須ヘッダー:

- `X-Session-Id`

何が返るか:

- analyzed 済みなら、analyze と同じ `result` shape が返ります
- まだなら `result: null` が返ります

未分析時の例:

```json
{
  "status": "draft",
  "result": null
}
```

### `GET /api/persons/:personId/analysis-cases`

何をする API か:

- ある Person にひも付いた analysis-case 一覧を返す API です

必須ヘッダー:

- `X-Session-Id`

何が返るか:

- `analysisCases` 配列
- `pagination` 情報

注意:

- 一覧 item はまだ最小 shape ではなく詳細形です

## 7. 仕様との差分

### 完全一致している点

- 6 API がそろっている
- `POST /api/sessions` 以外で `X-Session-Id` が必要
- `SESSION_INVALID (401)` が返る
- person / case の所有チェックがある
- status 遷移は `draft / analyzing / analyzed / error`
- `ALREADY_ANALYZED (409)` が返る

### 大筋一致まで寄せた点

- `POST /api/sessions` は `sessionId` と `expiresAt` を返すようにした
- `POST /api/analysis-cases` は主要必須項目を仕様書に寄せた
- `emojiUsed` は boolean に寄せた
- `toneType` と `messageLengthType` は enum に寄せた
- analyze / results の `result` には `id`, `analysisCaseId`, `generatedAt`, `promptVersion` を付けた
- `result.scores` は frontend と同じ 8 ラベルへそろえた

### まだ残っている差分

- 一覧 API の返り値はまだ詳細形です
- 一部の細かい length 制限は仕様書ほど厳密ではありません
- 内部エラーコードの名前は仕様書と完全一致ではありません

## 8. つまずきやすい点

- 新しいフロントは `sessionId` を使えばよいですが、レスポンスには `session` も残っています
- `POST /api/sessions` 以外は `X-Session-Id` を忘れると `401 SESSION_INVALID` です
- サーバー再起動でデータが消えるので、保存済み `personId` や `analysisCaseId` が急に使えなくなることがあります
- `emojiUsed` は今は boolean 推奨です
- `toneType` と `messageLengthType` は enum 推奨です
- 後方互換の日本語値も今は受けますが、新しいフロントでは使わない方が整理しやすいです
- 一覧 API の返り値だけはまだ軽い変換が必要です
