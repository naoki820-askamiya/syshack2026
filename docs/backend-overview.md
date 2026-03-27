# Backend Overview

## このバックエンドは何をするものか

このバックエンドは、相手の機嫌や感情傾向を分析するための API です。

- このアプリは、メッセージのやり取りや出来事の内容をフォームで入力して使います
- 分析したい相手を `person` として登録します
- 分析したい 1 回分の相談内容を `analysis-case` として保存します
- `analyze` を実行すると OpenAI に分析を依頼します
- AI が返した結果を保存し、あとで `results` として取り出せるようにします

今の実装で保存している主なものは次の 4 つです。

- `session`
- `person`
- `analysis-case`
- `analysis-result`

## フロント接続の観点で見た今の状態

- フロント接続に必要な 6 API は実装済みです
- 最初に `POST /api/sessions` を呼ぶと、`sessionId` と `expiresAt` が返ります
- 後方互換で `session.id` も残しています
- `POST /api/analysis-cases` では `personId`, `eventFacts`, `selfMessage`, `partnerMessage` が必須です
- `emojiUsed` は boolean に寄せています
- `toneType` は `formal / casual / mixed / unknown`、`messageLengthType` は `short / normal / long / unknown` を基本値にしています
- `POST /api/analysis-cases/:caseId/analyze` と `GET /api/analysis-cases/:caseId/results` の `result` には、`id`, `analysisCaseId`, `generatedAt`, `promptVersion` が入ります
- 一方で、一覧 API の返り値はまだ仕様書より詳細です
- 保存はインメモリなので、サーバー再起動でデータは消えます
