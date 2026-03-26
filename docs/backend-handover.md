# Backend Handover

## 今の状態

このバックエンドは、相手の機嫌や感情傾向を分析する MVP です。

## 最初に一番大事な注意

- 今は最初に `POST /api/sessions` を呼んで session を発行します
- 返ってきた `session.id` を、以後の API で `X-Session-Id` ヘッダーとして使います
- `POST /api/sessions` だけはヘッダー不要です

最初の確認では、ここを先に理解しておくのが大事です。
今は「最初に session を作り、その ID を他の API に付ける」と覚えてください。

今できることは次の通りです。

- Person を作る
- analysis-case を作る
- AI 分析を実行する
- 保存済み result を取る
- Person ごとの analysis-case 一覧を見る

今の前提は次の通りです。

- `POST /api/sessions` で session を発行してから使う
- `X-Session-Id` でデータの持ち主を区別する
- OpenAI を使うには `.env.local` の設定が必要
- Person を先に作って、その `personId` を analysis-case 作成で使う

今の repository はインメモリで動いています。

つまり、

- DB ではありません
- サーバーを再起動すると消えます

ハッカソン中に素早く動かすための簡易実装です。

## 起動方法

## 必要な環境変数

最低限必要なのは次の 2 つです。

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
  - 今回使うモデル ID を入れる値です

必要なら `PORT` も使えます。

例:

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5.4-mini
PORT=3000
```

## 起動コマンド

```powershell
npm install
```

```powershell
npm run build
```

```powershell
npm run server
```

## 起動時の注意

- `.env.local` が無いと OpenAI 呼び出しは失敗します
- `OPENAI_MODEL` が無いと analyze 時にエラーになります
- 今のサーバーは `node --experimental-strip-types` で起動しています
- データはメモリ保存なので、再起動すると消えます

## よく使うAPI

ここでは、よく使う API を「何をするものか」「何を送るか」「何が返るか」の順で説明します。

## POST /api/sessions

何をする API か:

- session を新しく作るための API です

今の状態:

- 今は使えます
- body 不要、ヘッダー不要で呼べます
- 返ってきた `session.id` を、次から `X-Session-Id` として使います

## POST /api/persons

何をする API か:

- 分析したい相手を作る API です

何を送るか:

- `displayName`
- `relationshipType`
- `ageRange`
- `genderHint`
- `notes`

何が返るか:

- 作成された `person`
- その中に `person.id` が入ります

この `person.id` は次の analysis-case 作成で使います。

## POST /api/analysis-cases

何をする API か:

- 今回の相談内容を保存する API です

何を送るか:

- `personId`
- `eventFacts`
- `selfMessage`
- `partnerMessage`
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

何が返るか:

- 作成された `analysisCase`
- その中に `analysisCase.id` が入ります

この `analysisCase.id` は analyze 実行で使います。

## POST /api/analysis-cases/:caseId/analyze

何をする API か:

- 指定した analysis-case に対して AI 分析を実行する API です

何を送るか:

- URL の `caseId`
- header の `X-Session-Id`

何が返るか:

- `status: "analyzed"`
- `result` の JSON

注意:

- すでに analyze 済みの case に対してもう一度呼ぶと `409 ALREADY_ANALYZED` になります

## GET /api/analysis-cases/:caseId/results

何をする API か:

- 保存済みの分析結果を取り出す API です

何を送るか:

- URL の `caseId`
- header の `X-Session-Id`

何が返るか:

- analyzed 済みなら `result`
- まだなら `result: null`

## GET /api/persons/:personId/analysis-cases

何をする API か:

- ある Person にひも付いた analysis-case 一覧を返す API です

何を送るか:

- URL の `personId`
- header の `X-Session-Id`

何が返るか:

- `analysisCases` 配列
- `pagination` 情報

## デモ手順

初心者向けに、一番分かりやすい流れを順番に書きます。

1. `POST /api/sessions` で session を作る
2. 返ってきた `session.id` を控える
3. `POST /api/persons` で Person を作る
4. 返ってきた `person.id` を控える
5. `POST /api/analysis-cases` で相談内容を作る
6. 返ってきた `analysisCase.id` を控える
7. `POST /api/analysis-cases/:caseId/analyze` で AI 分析を実行する
8. `GET /api/analysis-cases/:caseId/results` で結果を確認する
9. 必要なら `GET /api/persons/:personId/analysis-cases` で一覧を見る

## Windows向け curl 例

そのまま使いやすいように PowerShell / cmd でも使いやすい形にしています。

## 先に必ず読んでください

- `<personId>` と `<caseId>` は説明用のダミー文字です
- `<personId>` と `<caseId>` をそのまま打っても動きません
- `<sessionId>` も、そのまま打たずに `POST /api/sessions` の返り値へ置き換えてください
- 必ず、直前のレスポンスで返ってきた本物の ID に置き換えてください
- 置き換えないまま実行すると、`NOT_FOUND` などで失敗します

重要:

- 同じ確認の流れでは、`POST /api/sessions` で返ってきた同じ `session.id` を使い続けてください

## session 作成

```powershell
curl.exe -X POST "http://127.0.0.1:3000/api/sessions"
```

## Person 作成

```powershell
curl.exe -X POST "http://127.0.0.1:3000/api/persons" ^
  -H "Content-Type: application/json" ^
  -H "X-Session-Id: <sessionId>" ^
  -d "{\"displayName\":\"取引先A\",\"relationshipType\":\"customer\",\"ageRange\":\"30代\",\"genderHint\":\"unknown\",\"notes\":\"普段は返信が早い\"}"
```

## analysis-case 作成

```powershell
curl.exe -X POST "http://127.0.0.1:3000/api/analysis-cases" ^
  -H "Content-Type: application/json" ^
  -H "X-Session-Id: <sessionId>" ^
  -d "{\"personId\":\"<personId>\",\"eventFacts\":\"提案資料を送ったあと短い返信が返ってきた\",\"selfMessage\":\"ご確認よろしくお願いします\",\"partnerMessage\":\"確認します\",\"recentConversationText\":\"昨日は打ち合わせの後に資料送付。相手は会議続きだった。\",\"appType\":\"LINE\",\"userEmotion\":\"不安\",\"assumedPartnerEmotion\":\"少し冷たいかも\",\"partnerSpeakingStyle\":\"普段から短文\",\"contextNote\":\"今週は相手が繁忙期らしい\",\"concernText\":\"嫌われたのか忙しいだけなのか知りたい\",\"emojiUsed\":\"なし\",\"toneType\":\"事務的\",\"messageLengthType\":\"短め\"}"
```

## analyze 実行

```powershell
curl.exe -X POST "http://127.0.0.1:3000/api/analysis-cases/<caseId>/analyze" ^
  -H "X-Session-Id: <sessionId>"
```

## result 取得

```powershell
curl.exe "http://127.0.0.1:3000/api/analysis-cases/<caseId>/results" ^
  -H "X-Session-Id: <sessionId>"
```

## Person ごとの一覧

```powershell
curl.exe "http://127.0.0.1:3000/api/persons/<personId>/analysis-cases" ^
  -H "X-Session-Id: <sessionId>"
```

## つまずきやすい点

初心者がひっかかりやすい点を先に書いておきます。

## `X-Session-Id` を忘れる

今のバックエンドでは `POST /api/sessions` 以外の多くの API が `X-Session-Id` 必須です。
これを付け忘れると `401 SESSION_INVALID` になります。

## サーバー再起動でデータが消える

今はインメモリ実装です。
つまり、作った Person や analysis-case はサーバー再起動で消えます。

## analyzed 済みケースに analyze を打つと 409

同じ case をもう一度 analyze すると、

- `409 ALREADY_ANALYZED`

になります。

これは不具合ではなく、今の仕様です。

## `.env.local` の設定不足

`.env.local` に必要な値が無いと analyze が動きません。

## OpenAI API キー未設定

`OPENAI_API_KEY` が無いと OpenAI を呼べません。

## PowerShell / cmd の記号の扱い

Windows の curl 例では、

- `^`
- `\"`

などの記号が出てきます。

コピペ時に壊れやすいので、1行で打つか、記号を崩さないように注意してください。

## 今後の改善候補

次に着手しやすい改善候補は次の通りです。

- DB 化
- Person 更新 API
- AnalysisCase 更新 API
- フロントとの最終接続確認
- テスト追加
