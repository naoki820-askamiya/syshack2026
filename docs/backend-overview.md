# Backend Overview

## このバックエンドは何をするものか

このバックエンドは、相手の機嫌や感情傾向を分析するための API です。

- このアプリは、メッセージのやり取りや出来事の内容をフォームで入力して使います
- 分析したい相手を `person` として登録します
- 分析したい1回分の相談内容を `analysis-case` として保存します
- `analyze` を実行すると OpenAI に分析を依頼します
- AI が返した結果を保存し、あとで `results` として取り出せるようにします

今の実装で保存している主なものは次の 3 つです。

- `person`
  相手の名前や関係性など
- `analysis-case`
  今回の出来事、送った文、相手の文、補足メモなど
- `analysis-result`
  AI が返した分析結果

## 全体の流れ

このバックエンドは、大きく見ると次の順番で動きます。

## sessions

最初に session を用意して「誰のデータか」を区別します。

- session は、同じ人のデータをまとめるための印のようなものです
- 今は `POST /api/sessions` を呼ぶと、新しい session が発行されます
- 返ってきた `session.id` を、以後の API で `X-Session-Id` として使います

つまり、最初に session を 1 回作ってから、
その sessionId を使って Person や analysis-case を作る流れです。

## persons

次に、分析したい相手を `person` として登録します。

ここで登録するのは、たとえば次のような情報です。

- 表示名
- 関係性
- 年代メモ
- 性別ヒント
- 補足メモ

この `person` は session にひも付いて保存されます。

## analysis-cases

その次に、今回の相談内容を `analysis-case` として作ります。

ここで送るのは次のような情報です。

- 実際に起きたこと
- 自分が送った文
- 相手が返した文
- 最近の会話の流れ
- 不安に思っていること

このとき `personId` も一緒に送ります。

バックエンドは、

- その `personId` が本当に存在するか
- その person が同じ session の持ち物か

を確認してから保存します。

## analyze

`analysis-case` を作ったあとに、`analyze` を実行します。

この処理でやっていることは次の通りです。

1. `analysis-case` を取り出す
2. status を `analyzing` にする
3. 保存済みの Person 情報と analysisCase 情報を OpenAI に送る
4. AI が返した JSON を検証する
5. 結果を保存する
6. status を `analyzed` にする

もし途中で失敗したら status は `error` になります。

## results

analyze が終わると、保存済みの結果を `results` API で取れます。

- まだ analyze 前なら `result: null`
- analyze 後なら AI の結果 JSON

が返ります。

## person別一覧

最後に、ある person にひも付いた analysis-case を一覧で見ることもできます。

- `GET /api/persons/:personId/analysis-cases`

を使うと、その person の相談履歴を取得できます。

## バックエンドのフォルダ構成

初心者向けに、とても単純に言うと次の分担です。

## routes

URL ごとに処理の行き先を決める場所です。

たとえば、

- `/api/persons`
- `/api/analysis-cases`

のような URL を受け取ったとき、
どの controller に渡すかを決めます。

## controllers

受け取ったリクエストを整理して service に渡す場所です。

ここでよくやることは次の通りです。

- `req.body` を読む
- `req.params` を読む
- `req.query` を読む
- service を呼ぶ
- `res.json(...)` で返す

## services

実際の処理の流れをまとめる場所です。

ここが「何をするか」の中心です。

たとえば、

- Person を保存する
- analysis-case を作る
- AI を呼ぶ
- status を変える
- result を保存する

といった流れは service にあります。

## repositories

データの保存・取得を担当する場所です。

今は本物の DB ではなく、`Map` を使ってメモリ上に保存しています。

つまり、

- 保存はできる
- 取り出しもできる
- でもサーバー再起動で消える

という状態です。

## ai

OpenAI API を呼ぶ場所です。

このフォルダには、

- system prompt を作る
- user prompt を作る
- OpenAI に送る
- JSON を取り出す
- Zod で形をチェックする

という処理が入っています。

## middlewares

共通処理を途中ではさむ仕組みです。

今は主に次の 2 つがあります。

- session チェック
- 共通エラーハンドリング

## types

型をまとめる場所です。

型は「データの設計図」です。
何を受け取って何を返すのかを、コード上ではっきりさせるために使います。

## utils

複数の場所で使う小さな共通処理を置く場所です。

たとえば、

- timeout
- エラー整形
- 環境変数読み取り

などです。

## 1回の分析で裏側で何が起きるか

ここでは、1回の analyze の流れを順番に追います。

## 1. session を用意する

最初に `POST /api/sessions` を呼ぶと、
新しい session が発行されます。

これは「このデータは誰のものか」を区別するために必要です。

## 2. person を作る

次に `POST /api/persons` で person を作ります。

ここで作った person には `person.id` が付きます。

## 3. analysis-case を作る

`POST /api/analysis-cases` で analysis-case を作ります。

このとき、

- 相談内容
- `personId`

を送ります。

バックエンドは `personId` を見て、
本当にその person があるかを確認します。

## 4. analyze を実行する

`POST /api/analysis-cases/:caseId/analyze` を呼ぶと、AI 分析が始まります。

service ではまず status を `analyzing` に変えます。

これは、
「今ちょうど分析中です」
と分かるようにするためです。

## 5. AI が JSON を返す

OpenAI には、

- Person 情報
- analysisCase 情報
- どういう形で返してほしいか

を送ります。

AI は最終的に JSON 形式で結果を返します。

## 6. バックエンドがその JSON を検証する

ただし、AI が返したものをそのまま信用するわけではありません。

バックエンドは次の確認をします。

- JSON として読めるか
- 必要なキーがそろっているか
- 値の型が合っているか
- `scores` が 0〜1 の範囲か

この確認に Zod を使っています。

## 7. 結果を保存する

問題がなければ、分析結果を repository に保存します。

今は DB ではなくインメモリ保存です。

## 8. result を取得できるようになる

保存後は status が `analyzed` になり、

- `GET /api/analysis-cases/:caseId/results`

で結果を取り出せるようになります。

## OpenAI に送っているもの

OpenAI に送っている主な内容は次の 4 つです。

## person

相手の基本情報です。

- displayName
- relationshipType
- ageRange
- genderHint
- notes

相手がどんな立場の人かを AI が考える材料になります。

## analysisCase

今回の相談内容です。

- eventFacts
- selfMessage
- partnerMessage
- recentConversationText
- contextNote

などが入ります。

これは「今回の状況」を AI に伝えるための本体です。

## system prompt

system prompt は、AI 全体への指示です。

たとえば、

- JSON だけ返すこと
- 決めつけすぎないこと
- 良い兆候も返すこと

のようなルールを書いています。

つまり、

「今回の分析で守ってほしい約束」

を書いている部分です。

## user prompt

user prompt は、今回の分析対象データそのものです。

system prompt が「ルール」なら、
user prompt は「今回の材料」です。

## インメモリ実装とは何か

今の repository は DB ではありません。

`Map` を使って、サーバープロセスのメモリにだけ保存しています。

この形の意味は次の通りです。

- 良い点
  - 実装が簡単
  - ハッカソン中に素早く動かしやすい
- 注意点
  - サーバー再起動で消える
  - 複数人で同時に長く使うのには向かない
  - 本番向けではない

今この形にしている理由は、

- まず動く MVP を早く作るため
- DB 設計の前に API の流れを固めるため

です。

## 今できること

今このブランチでできることは次の通りです。

- `POST /api/persons` で Person を作れる
- `POST /api/sessions` で session を作れる
- `POST /api/analysis-cases` で analysis-case を作れる
- `POST /api/analysis-cases/:caseId/analyze` で OpenAI 分析を実行できる
- `GET /api/analysis-cases/:caseId/results` で結果を取れる
- `GET /api/persons/:personId/analysis-cases` で Person ごとの一覧を見られる
- 同じ case を analyze 済みのときは `409 ALREADY_ANALYZED` になる

## 今まだやっていないこと

まだ未対応、または簡易実装のままのものは次の通りです。

- DB 化
- 本番用の認証
- Person 更新 API
- AnalysisCase 更新 API
- OCR
- 自動テストの強化
- フロントとの最終的な結合確認
