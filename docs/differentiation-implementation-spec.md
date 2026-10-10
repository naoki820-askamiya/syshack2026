# KIGEN404 差別化機能 実装計画仕様書

## 1. 目的

この仕様書は、KIGEN404を単なるAI感情分析アプリではなく、人間関係の不安を継続的に整理するアプリへ発展させるための実装計画を定義する。

KIGEN404の差別化の中心は、「相手が怒っているか」を一度だけ推定することではない。人物ごとの関係性メモリ、過去相談との比較、AI判断の根拠表示、相談後の振り返りを通じて、ユーザーが自分の受け取り方を整え、次の行動を選びやすくすることにある。

この仕様書では、次の実装対象を段階的に定義する。

- `analysis_results.result_json` の拡張
- 分析結果UIの改善
- `analysis_feedbacks` の追加
- `person_profiles` の追加
- 過去傾向と今回差分の比較
- `user_pattern_summaries` の追加
- AI入力・AI出力・API・DB・UIの対応関係

## 2. 前提

この仕様書は、既存の次のDB設計方針に従う。

- `docs/database-design.md`
- `docs/database-design-readable.md`

認証と所有権に関する前提は次の通り。

- 認証は Supabase Auth に任せる。
- アプリ側に自前 `users` テーブルは作らない。
- `auth_sessions` テーブルは作らない。
- `password_hash` / `refresh_token_hash` は作らない。
- 自前JWT発行はしない。
- `/api/auth/register`, `/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout` は作らない。
- 各業務テーブルは `user_id` を持つ。
- `user_id` は Supabase Auth の `auth.users.id` とする。
- クライアントから `user_id` を送らせない。
- 他人のリソースIDを指定された場合は `404 RESOURCE_NOT_FOUND` を返す。
- 業務データを localStorage に保存しない。

分析結果に関する前提は次の通り。

- `analysis_results` は履歴保存する。
- 最新の分析結果は `created_at` ではなく `version DESC` で取得する。
- `analysis_cases` に `latest_result_id` のような最新結果IDは持たせない。
- `analysis_results.result_json` はAI構造化出力全文を保存する。

DB管理に関する前提は次の通り。

- Prisma schema と SQL migration の責務分担を維持する。
- PostgreSQL固有の制約、trigger、partial index、DESC付きindex、RLS policyはSQL migrationを正とする。
- `schema.prisma` はPrisma Clientで扱う型・relationの正本とする。

この仕様書で追加するテーブルも、原則として `user_id uuid not null references auth.users(id) on delete cascade` を持ち、認証済みユーザーの所有データとして扱う。

## 3. 差別化方針と実装対象の対応

| 差別化方針 | 実現したい体験 | DB | API | UI | AI出力 |
| --- | --- | --- | --- | --- | --- |
| 人物ごとの関係性メモリ | 相手ごとの普段の傾向や関係性を踏まえて相談できる | `persons`, `analysis_cases`, `analysis_results`, `person_profiles` | Person詳細、Profile取得・再生成 | Person詳細画面、傾向パネル | `relationshipMemoryUsed`, `usualPatterns` |
| 「いつもの傾向」と「今回の異常」を分ける | 普段から短文なのか、今回だけ違うのかを分けて見る | `person_profiles`, `analysis_results.result_json` | 分析実行、最新結果取得 | 通常傾向と今回差分の比較表示 | `usualVsCurrent`, `deviationSignals` |
| AIの結論ではなく判断根拠を見せる | スコアだけでなく、理由・証拠・別解釈を確認できる | `analysis_results.result_json` | 結果取得 | 根拠カード、別解釈、注意点 | `evidence`, `alternativeInterpretations`, `confidenceNotes` |
| 返信文生成よりも認知の偏りを整える | 悪く見すぎていないか、他の見方がないかを確認できる | `analysis_results.result_json`, `analysis_feedbacks`, `user_pattern_summaries` | Feedback登録、Pattern取得 | 受け取り方の整理、振り返り | `cognitiveReframe`, `notOverreadingReasons` |
| 人間関係のOSにする | 相談、分析、根拠確認、行動、振り返り、次回反映をつなげる | 全業務テーブル | Case/Result/Feedback/Profile/Pattern API | 履歴、人物別OS画面 | 分析結果と要約を次回文脈に利用 |

実装上は、最初から大きなメモリ機能を作らない。まず `analysis_results.result_json` と結果UIで「根拠を見せる」体験を作り、その後にフィードバック、人物要約、ユーザー傾向要約を追加する。

## 4. 実装フェーズ全体像

実装は次の5段階で進める。

| Phase | 目的 | 主な変更 | 依存 |
| --- | --- | --- | --- |
| Phase 1 | AI結論ではなく根拠を見せる | `result_json` 拡張、結果UI改善 | 既存 `analysis_results` |
| Phase 2 | 分析後の振り返りを保存する | `analysis_feedbacks` 追加、Feedback API/UI | Phase 1 |
| Phase 3 | 人物ごとの関係性メモリを作る | `person_profiles` 追加、Person傾向UI | Phase 2 |
| Phase 4 | いつもの傾向と今回差分を比較する | AI入力に `person_profiles` を含める、比較出力追加 | Phase 3 |
| Phase 5 | ユーザー自身の受け取り方の傾向を扱う | `user_pattern_summaries` 追加、認知整理UI | Phase 2, Phase 4 |

Phase 1はDBテーブル追加を必須にしない。既存の `analysis_results.result_json` を拡張し、UIで価値を出す。Phase 2以降で、振り返りと要約をDBに保存し、次回分析の文脈に利用する。

## 5. Phase 1: 分析結果JSONと結果UIの改善

### 目的

AIの最終判断だけを表示するのではなく、判断根拠、別解釈、悪く見すぎない理由、次の安全な行動を表示する。

### DB変更

新規テーブルは追加しない。既存の `analysis_results.result_json` を拡張する。

`analysis_results.result_schema_version` を更新し、拡張後のJSON構造を区別する。例として `kigen-analysis-result-v2` を使う。

### `result_json` 追加項目

```json
{
  "schemaVersion": "kigen-analysis-result-v2",
  "summary": {
    "oneLine": "相手が怒っていると断定する材料は弱いが、返信の短さは気になりやすい状態です。",
    "riskLevel": "low",
    "confidence": "medium"
  },
  "emotionEstimate": {
    "primary": "neutral_or_busy",
    "candidates": [
      {
        "label": "忙しい",
        "score": 0.45,
        "reason": "返信が短い一方で拒絶表現はないため"
      }
    ]
  },
  "evidence": {
    "signalsForConcern": [
      {
        "text": "返信が普段より短い",
        "source": "partner_message",
        "strength": "medium"
      }
    ],
    "signalsAgainstConcern": [
      {
        "text": "否定や攻撃の表現はない",
        "source": "partner_message",
        "strength": "high"
      }
    ],
    "unknowns": [
      "相手の直近の忙しさは入力からは分からない"
    ]
  },
  "alternativeInterpretations": [
    {
      "label": "忙しくて短文になった",
      "reason": "返信内容は短いが会話を切る明確な表現はない"
    }
  ],
  "notOverreadingReasons": [
    "短文だけでは怒りの根拠として弱い",
    "絵文字がないことは相手の通常スタイルの可能性がある"
  ],
  "cognitiveReframe": {
    "possibleBiases": [
      {
        "label": "短文を拒絶として受け取りやすい",
        "basis": "ユーザーの不安点が返信の短さに集中している"
      }
    ],
    "balancedView": "今は相手の気持ちを断定せず、次のやり取りで確認する方が安全です。"
  },
  "recommendedActions": [
    {
      "label": "軽い確認をする",
      "actionType": "send_message",
      "safety": "safe",
      "reason": "相手を責めずに状況確認できるため"
    }
  ],
  "avoidActions": [
    {
      "label": "怒ってる？と詰める",
      "reason": "相手が忙しいだけの場合に圧を与える可能性がある"
    }
  ],
  "replyDrafts": [
    {
      "tone": "light",
      "text": "了解！忙しかったらまたあとで大丈夫だよ。"
    }
  ],
  "disclaimer": {
    "notDiagnosis": true,
    "text": "この分析は心理診断ではなく、入力内容から考えられる解釈の整理です。"
  }
}
```

### 5-x. 感情スコア分析の表示項目

感情スコア分析は、相手の感情を断定するための数値ではなく、入力内容から見える可能性を整理するための表示項目とする。DBテーブルは追加しない。AI出力は `analysis_results.result_json` に保存し、最新結果取得は引き続き `version DESC` を使う。`created_at DESC` を最新判定に使わない。

スコアは、相手の本心を断定するものではない。文面、背景、過去傾向から見える判断材料として扱う。UIではスコアだけを単独で強調せず、各スコアには必ず理由を紐づける。

`大丈夫` は断定ではなく、「悪く考えすぎなくてよい材料がある」という意味で使う。

#### `result_json` 追加項目

Phase 1では、既存の `emotionEstimate` に加えて、UI表示に使う詳細項目として `emotionScoreAnalysis` を追加する。

```json
{
  "emotionScoreAnalysis": {
    "confidenceLevel": "medium",
    "description": "このスコアは相手の本心を断定するものではなく、文面・背景・過去傾向から見える判断材料です。",
    "scores": {
      "anger": {
        "label": "怒り気味",
        "score": 0,
        "category": "concern",
        "reason": ""
      },
      "coldness": {
        "label": "冷たい",
        "score": 0,
        "category": "concern",
        "reason": ""
      },
      "distance": {
        "label": "距離あり",
        "score": 0,
        "category": "concern",
        "reason": ""
      },
      "busyness": {
        "label": "忙しい",
        "score": 0,
        "category": "context",
        "reason": ""
      },
      "flatness": {
        "label": "淡々",
        "score": 0,
        "category": "context",
        "reason": ""
      },
      "reassurance": {
        "label": "大丈夫",
        "score": 0,
        "category": "relief",
        "reason": ""
      }
    }
  }
}
```

`score` は0から100の整数とする。

#### スコア項目

初期実装で表示するスコアは次を基本とする。

| キー | 表示ラベル | 分類 | 説明 |
| --- | --- | --- | --- |
| `anger` | 怒り気味 | 気になるサイン | 相手が不満・怒りを持っているように見える度合い |
| `coldness` | 冷たい | 気になるサイン | 文面がそっけなく、温度感が低く見える度合い |
| `distance` | 距離あり | 気になるサイン | 少し距離を置かれているように見える度合い |
| `busyness` | 忙しい | 状況要因 | 忙しさや余裕のなさで短文・事務的になっているように見える度合い |
| `flatness` | 淡々 | 状況要因 | 感情表現が少なく、用件中心に見える度合い |
| `reassurance` | 大丈夫 | 安心材料 | 悪く考えすぎなくてよい材料がある度合い |

スコアは合計100に正規化しない。複数の可能性が同時に高くなることを許容する。たとえば「忙しい可能性」と「怒っていない可能性」は同時に成立し得るため、円グラフのような排他的表示にはしない。

#### categoryの定義

| category | 意味 |
| --- | --- |
| `concern` | 気になるサイン |
| `context` | 状況要因 |
| `relief` | 安心材料 |

`confidenceLevel` は `low`, `medium`, `high` のいずれかとする。これはスコア全体の確からしさを示す補助情報であり、心理診断・感情診断の基準ではない。

#### UI表示

結果画面では、感情スコア分析を表示してよい。ただし、相手の気持ちの確定結果として表示しない。見出しは「感情スコア」単独ではなく、「入力から見える感情の可能性」または「感情の見立て」とする。

スコアは最上部に大きく出しすぎない。ユーザーが数字だけに引っ張られるのを避けるため、Phase 1の結果UIでは次の表示順を基本にする。

1. ひとこと見立て
2. 悪く見える理由
3. 悪く見すぎなくてよい理由
4. 感情スコア分析
5. 次の安全な行動

表示項目は次の通り。

- 6項目のスコア
- 各項目の理由
- 注意文
- 必要ならレーダーチャートまたはバー表示

UIでは、スコアだけが目立ちすぎないようにする。レーダーチャートやバー表示を使う場合も、必ず各項目の理由を近くに表示する。

表示ラベルは次で固定する。

```txt
怒り気味
冷たい
距離あり
忙しい
淡々
大丈夫
```

分類表示をする場合は次に分ける。

```txt
気になるサイン:
- 怒り気味
- 冷たい
- 距離あり

状況要因:
- 忙しい
- 淡々

安心材料:
- 大丈夫
```

UI上には、次の注意文を表示できるようにする。

```txt
このスコアは、相手の本心を断定するものではありません。
文面・背景・過去傾向から見える判断材料を整理したものです。
```

避ける表示:

- 「怒り度 80%」のように相手の内面を断定する表示
- 感情スコアだけを大きく表示し、根拠を隠す表示
- 合計100%の円グラフ表示
- `anger` が高いだけで危険・破綻を示唆する表示
- 「大丈夫です」と断定する表示

使う表示:

- 「怒り気味に見える材料があります」
- 「冷たく見える要素があります」
- 「忙しさによる短文の可能性があります」
- 「悪く考えすぎなくてよい材料があります」

#### 既存項目からの置き換え

旧UIまたは旧JSONに以下の項目がある場合は、次のように置き換える。

| 旧項目 | 新項目 | 扱い |
| --- | --- | --- |
| 怒り | 怒り気味 | 表現変更 |
| 冷たさ | 冷たい | 表現変更 |
| 距離感 | 距離あり | 表現変更 |
| 忙しさ | 忙しい | 表現変更 |
| 圧の強さ | 廃止 | `怒り気味`、`冷たい`、`距離あり` に吸収 |
| 機嫌のよさ | 廃止 | 相手の機嫌を断定する印象が強いため |
| 嬉しさ | 廃止 | 推定が難しく、使う場面が限定的なため |
| 安心 | 大丈夫 | 表現変更。ただし「悪く考えすぎなくてよい材料」という意味で扱う |
| 事務的 | 淡々 | 表現変更 |

#### AI出力時の注意

AIは各スコアについて、必ず `score` と `reason` を出力する。根拠のないスコアだけの出力は不可とする。

AIは次の表現を避ける。

- 「相手は怒っています」
- 「大丈夫です」
- 「怒り度」
- 「嫌われ度」
- 「脈なし度」
- 「危険度」
- 医療診断・心理診断に見える表現

AIは次の表現を優先する。

- 「怒り気味に見える材料があります」
- 「冷たく見える要素があります」
- 「忙しさによる短文の可能性があります」
- 「悪く考えすぎなくてよい材料があります」

### UI変更

結果画面に次の領域を追加する。

- 結論サマリー
- 入力から見える感情の可能性
- 気になる根拠
- 心配しすぎなくてよい根拠
- 別解釈
- 受け取り方の整理
- 次の安全な行動
- 避けた方がよい行動

返信文生成は主役にしない。返信文は「次の安全な行動」の一部として扱い、画面上の優先度は根拠と認知整理より下げる。

### 完了条件

- 最新結果取得が `version DESC` のまま維持されている。
- `analysis_cases` に最新結果IDを追加していない。
- `result_schema_version` により旧JSONと新JSONを区別できる。
- 感情スコア分析が `analysis_results.result_json.emotionScoreAnalysis` に保存される。
- `emotionScoreAnalysis.scores` に6項目が含まれる。
- 6項目のキーは `anger`, `coldness`, `distance`, `busyness`, `flatness`, `reassurance` で固定されている。
- 各項目に `label`, `score`, `category`, `reason` がある。
- `score` は0から100の整数である。
- UIでは6項目のラベルが `怒り気味`, `冷たい`, `距離あり`, `忙しい`, `淡々`, `大丈夫` として表示される。
- UIに「相手の本心を断定しない」注意文が表示される。
- スコアだけが単独で強調されない。
- `大丈夫` は「悪く考えすぎなくてよい材料」という意味で説明される。
- 既存の `analysis_results` の保存・取得方式を壊さない。
- 結果UIで、結論だけでなく根拠・別解釈・認知整理が表示される。
- AI出力に心理診断や人格診断として断定する文言が含まれない。

## 6. Phase 2: analysis_feedbacks の実装

### 目的

分析結果に対するユーザーの振り返りを保存し、次回以降の分析改善と認知整理に使えるようにする。

FeedbackはAIの正誤判定だけではない。実際に相手が怒っていたか、提案された行動が役に立ったか、自分が悪く見すぎていたかを、ユーザーが後から記録するためのものとする。

### 追加テーブル

`analysis_feedbacks`

| カラム | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `id` | `uuid` | yes | フィードバックID |
| `user_id` | `uuid` | yes | 所有ユーザー。`auth.users(id)` を参照 |
| `analysis_case_id` | `uuid` | yes | 対象ケース |
| `analysis_result_id` | `uuid` | yes | 対象分析結果 |
| `actual_outcome` | `varchar(50)` | no | `angry`, `not_angry`, `busy`, `unclear`, `other` など |
| `helpfulness_score` | `integer` | no | 1から5 |
| `overread_score` | `integer` | no | 悪く見すぎていた度合い。1から5 |
| `used_recommended_action` | `boolean` | no | 推奨行動を使ったか |
| `outcome_note` | `text` | no | 振り返りメモ |
| `created_at` | `timestamptz` | yes | 作成日時 |
| `updated_at` | `timestamptz` | yes | 更新日時。DBトリガーで更新 |

### 制約

- `user_id` は `auth.users(id)` を参照する。
- `(user_id, analysis_case_id)` は `analysis_cases(user_id, id)` を参照する。
- `(user_id, analysis_result_id)` は `analysis_results(user_id, id)` を参照する。
- `helpfulness_score` は `1 <= helpfulness_score <= 5`。
- `overread_score` は `1 <= overread_score <= 5`。
- 同一ユーザー・同一分析結果に対するFeedbackは原則1件とするため、`UNIQUE (user_id, analysis_result_id)` を置く。

PostgreSQL固有のCHECK制約、updated_at trigger、RLS policyはSQL migrationを正とする。

### API

- `POST /api/analysis-results/:resultId/feedback`
- `GET /api/analysis-results/:resultId/feedback`
- `PATCH /api/analysis-feedbacks/:feedbackId`

いずれも `user_id` はクライアントから受け取らない。認証済みユーザーIDをサーバー側で取得し、所有権条件に含める。他人の `resultId` または `feedbackId` は `404 RESOURCE_NOT_FOUND` とする。

### UI

分析結果画面の末尾に振り返りUIを追加する。

- 実際どうだったか
- 分析は役に立ったか
- 自分が悪く見すぎていたと思うか
- 推奨行動を使ったか
- 任意メモ

振り返りUIは、ユーザーを責める表現にしない。「あなたの認知が歪んでいる」とは表示せず、「悪く見すぎていた可能性」「別の見方ができた点」として扱う。

### 完了条件

- FeedbackがDBに保存される。
- 他人の結果IDに対するFeedback登録は `404 RESOURCE_NOT_FOUND` になる。
- Feedback保存時にクライアント送信の `user_id` を使っていない。
- localStorageにFeedbackを保存していない。
- `analysis_feedbacks` のDB固有制約がSQL migrationにある。

## 7. Phase 3: person_profiles の実装

### 目的

人物ごとの関係性メモリを作る。過去相談を毎回すべてAIに渡すのではなく、相手ごとの傾向を要約した `person_profiles` をAI入力に使える形で保存する。

### 追加テーブル

`person_profiles`

| カラム | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `id` | `uuid` | yes | Profile ID |
| `user_id` | `uuid` | yes | 所有ユーザー。`auth.users(id)` を参照 |
| `person_id` | `uuid` | yes | 対象Person |
| `profile_schema_version` | `varchar(50)` | yes | Profile JSON構造のバージョン |
| `summary_json` | `jsonb` | yes | 人物傾向要約 |
| `source_case_count` | `integer` | yes | 要約に使ったケース数 |
| `source_latest_case_id` | `uuid` | no | 要約時点で参照した最新ケース |
| `generated_by_model` | `varchar(100)` | no | 要約生成モデル |
| `generated_at` | `timestamptz` | yes | 生成日時 |
| `created_at` | `timestamptz` | yes | 作成日時 |
| `updated_at` | `timestamptz` | yes | 更新日時。DBトリガーで更新 |

### 制約

- `user_id` は `auth.users(id)` を参照する。
- `(user_id, person_id)` は `persons(user_id, id)` を参照する。
- `summary_json` はJSON objectである。
- `source_case_count >= 0`。
- 原則として現行ProfileはPersonごとに1件とするため、`UNIQUE (user_id, person_id)` を置く。

履歴型にする場合は、`version` カラムを追加し、最新Profileを `version DESC` で取得する設計に変更する。ただし初期実装ではPersonごとに1件の更新型とする。

### `summary_json` 例

```json
{
  "schemaVersion": "person-profile-v1",
  "usualCommunicationStyle": {
    "messageLength": "short",
    "emojiFrequency": "low",
    "replySpeed": "unknown",
    "tone": "casual"
  },
  "relationshipNotes": [
    "普段から短文で返信する傾向がある",
    "忙しい時期は返信が遅くなる可能性がある"
  ],
  "recurringConcernPatterns": [
    {
      "label": "短文返信を冷たく感じる相談が複数回ある",
      "basis": "過去相談の不安点に短文返信が繰り返し登場している"
    }
  ],
  "stableSignals": [
    "短文でも会話が継続しているケースがある"
  ],
  "caution": {
    "notFact": true,
    "text": "この要約は過去相談から見える傾向であり、相手の内面を断定するものではありません。"
  }
}
```

### Profile生成タイミング

初期実装では、次のいずれかで再生成する。

- Feedback登録後
- 分析完了後
- Person詳細画面でユーザーが手動更新したとき

自動再生成は負荷とコストが増えるため、Phase 3では手動更新または分析完了後の限定実行を優先する。

### 完了条件

- PersonごとのProfileが保存・取得できる。
- Profile生成に使うケースは認証済みユーザー本人のものだけである。
- 他人の `personId` を指定した取得・生成は `404 RESOURCE_NOT_FOUND` になる。
- 過去相談本文を無制限にAIへ渡さず、必要な件数・項目に絞る。
- Profile UIに「断定ではなく傾向」という注意表示がある。

## 8. Phase 4: 「いつもの傾向」と「今回の異常」の比較

### 目的

分析時に `person_profiles` を参照し、今回の相談が「普段通りに見える点」と「普段と違って気になる点」を分けて出力する。

### AI入力

分析実行時に、対象Personの `person_profiles.summary_json` を取得してAIへ渡す。Profileが存在しない場合は、Profileなしで分析する。

AIへ渡す内容は最小限にする。

- 今回の相談入力
- `analysis_cases.person_snapshot`
- 対象Personの `person_profiles.summary_json`
- 必要に応じて直近数件のケース要約
- ユーザーFeedbackから得られた軽量な振り返り傾向

### `result_json` 追加項目

```json
{
  "usualVsCurrent": {
    "usualPatternsUsed": [
      {
        "label": "普段から短文が多い",
        "source": "person_profile",
        "relevance": "high"
      }
    ],
    "sameAsUsual": [
      {
        "label": "今回も短文だが、過去傾向と一致している",
        "reason": "person_profile上、短文返信は普段から見られる"
      }
    ],
    "deviationSignals": [
      {
        "label": "今回は会話を終わらせる表現がある",
        "strength": "medium",
        "reason": "過去傾向にはない終了表現が含まれる"
      }
    ],
    "comparisonConclusion": "短文自体は普段通りだが、会話を切る表現は少し注意してよいです。"
  }
}
```

### UI

結果画面に比較パネルを追加する。

- いつもの傾向
- 今回も普段通りに見える点
- 今回だけ違って見える点
- 比較から見た注意度

「異常」という言葉は内部概念として扱い、UIでは必要以上に不安を煽らない。「今回だけ違って見える点」「普段との違い」と表現する。

### 完了条件

- Profileがある場合、分析結果に `usualVsCurrent` が含まれる。
- Profileがない場合も分析は失敗しない。
- AIがProfileを相手の事実や心理として断定しない。
- UIで「普段通り」と「今回の違い」が分けて表示される。

## 9. Phase 5: user_pattern_summaries の実装

### 目的

ユーザー自身の受け取り方の傾向を、心理診断ではなく利用履歴から見える傾向として扱う。返信の短さ、絵文字の有無、返信時間などを悪く解釈しやすい場合に、次回分析で認知整理をしやすくする。

### 追加テーブル

`user_pattern_summaries`

| カラム | 型 | 必須 | 説明 |
| --- | --- | --- | --- |
| `id` | `uuid` | yes | Summary ID |
| `user_id` | `uuid` | yes | 所有ユーザー。`auth.users(id)` を参照 |
| `summary_schema_version` | `varchar(50)` | yes | Summary JSON構造のバージョン |
| `summary_json` | `jsonb` | yes | ユーザー傾向要約 |
| `source_feedback_count` | `integer` | yes | 参照したFeedback数 |
| `source_case_count` | `integer` | yes | 参照したCase数 |
| `generated_by_model` | `varchar(100)` | no | 要約生成モデル |
| `generated_at` | `timestamptz` | yes | 生成日時 |
| `created_at` | `timestamptz` | yes | 作成日時 |
| `updated_at` | `timestamptz` | yes | 更新日時。DBトリガーで更新 |

### 制約

- `user_id` は `auth.users(id)` を参照する。
- `summary_json` はJSON objectである。
- `source_feedback_count >= 0`。
- `source_case_count >= 0`。
- 初期実装ではユーザーごとに1件の更新型とし、`UNIQUE (user_id)` を置く。

### `summary_json` 例

```json
{
  "schemaVersion": "user-pattern-summary-v1",
  "observedPatterns": [
    {
      "label": "短文返信をネガティブに受け取りやすい",
      "basis": "複数の相談で不安点が返信の短さに集中している",
      "confidence": "medium"
    }
  ],
  "helpfulReframes": [
    "短文だけでは拒絶と断定しない",
    "相手の忙しさや普段の文体も一緒に見る"
  ],
  "safetyNote": {
    "notDiagnosis": true,
    "text": "これは心理診断ではなく、KIGEN404内の相談履歴から見える利用上の傾向です。"
  }
}
```

### UI

ユーザー向けには「あなたの心理傾向」ではなく、「相談履歴から見える受け取り方の傾向」として表示する。

表示項目は次の通り。

- よく不安材料になりやすい要素
- 役に立ちやすい見方の切り替え
- 次回相談時に確認するとよい点
- この要約をAI分析に使うかどうかの説明

削除または再生成の導線を用意する。将来的には、ユーザーがこの要約をAI入力に使わない設定も検討する。

### 完了条件

- ユーザーごとの傾向要約が保存・取得できる。
- 要約は心理診断・医療診断・人格診断として表示されない。
- AI入力に使う場合、ユーザー本人の要約だけが渡される。
- localStorageに要約を保存していない。

## 10. API仕様

### 共通方針

- すべての保護APIはSupabase Authの認証済みユーザーを必要とする。
- クライアントから `user_id` を受け取らない。
- DBアクセスでは必ず `user_id = auth.users.id` 相当の所有権条件を含める。
- 他人のリソースIDは `404 RESOURCE_NOT_FOUND` として扱う。
- 業務データはlocalStorageに保存しない。

### 追加API一覧

| Method | Path | 目的 | Phase |
| --- | --- | --- | --- |
| `GET` | `/api/analysis-cases/:caseId/results/latest` | ケースの最新結果取得 | Phase 1 |
| `POST` | `/api/analysis-results/:resultId/feedback` | Feedback作成 | Phase 2 |
| `GET` | `/api/analysis-results/:resultId/feedback` | Feedback取得 | Phase 2 |
| `PATCH` | `/api/analysis-feedbacks/:feedbackId` | Feedback更新 | Phase 2 |
| `GET` | `/api/persons/:personId/profile` | Person Profile取得 | Phase 3 |
| `POST` | `/api/persons/:personId/profile:regenerate` | Person Profile再生成 | Phase 3 |
| `GET` | `/api/user-pattern-summary` | ユーザー傾向要約取得 | Phase 5 |
| `POST` | `/api/user-pattern-summary:regenerate` | ユーザー傾向要約再生成 | Phase 5 |
| `DELETE` | `/api/user-pattern-summary` | ユーザー傾向要約削除 | Phase 5 |

### 最新結果取得

`GET /api/analysis-cases/:caseId/results/latest`

DB取得は必ず次の考え方に従う。

```sql
SELECT *
FROM analysis_results
WHERE user_id = :userId
  AND analysis_case_id = :caseId
ORDER BY version DESC
LIMIT 1;
```

`created_at DESC` を最新判定に使わない。

### Feedback作成

`POST /api/analysis-results/:resultId/feedback`

Request body:

```json
{
  "actualOutcome": "busy",
  "helpfulnessScore": 4,
  "overreadScore": 3,
  "usedRecommendedAction": true,
  "outcomeNote": "翌日に普通に返信が来た"
}
```

Response body:

```json
{
  "feedback": {
    "id": "uuid",
    "analysisResultId": "uuid",
    "analysisCaseId": "uuid",
    "actualOutcome": "busy",
    "helpfulnessScore": 4,
    "overreadScore": 3,
    "usedRecommendedAction": true,
    "outcomeNote": "翌日に普通に返信が来た",
    "createdAt": "2026-04-28T00:00:00.000Z",
    "updatedAt": "2026-04-28T00:00:00.000Z"
  }
}
```

### Person Profile取得

`GET /api/persons/:personId/profile`

Response body:

```json
{
  "profile": {
    "id": "uuid",
    "personId": "uuid",
    "profileSchemaVersion": "person-profile-v1",
    "summaryJson": {},
    "sourceCaseCount": 5,
    "generatedAt": "2026-04-28T00:00:00.000Z"
  }
}
```

Profileが存在しない場合は、対象Personが存在するなら `profile: null` を返す。他人のPersonの場合は `404 RESOURCE_NOT_FOUND` とする。

### ユーザー傾向要約取得

`GET /api/user-pattern-summary`

Response body:

```json
{
  "summary": {
    "id": "uuid",
    "summarySchemaVersion": "user-pattern-summary-v1",
    "summaryJson": {},
    "sourceFeedbackCount": 10,
    "sourceCaseCount": 12,
    "generatedAt": "2026-04-28T00:00:00.000Z"
  }
}
```

存在しない場合は `summary: null` を返す。

## 11. AI入力・AI出力仕様

### AI入力の共通方針

AIへ渡す情報は、分析に必要な最小限にする。

渡してよい情報:

- 今回の相談本文
- `analysis_cases.person_snapshot`
- 対象Personのメモ
- 対象Personの `person_profiles.summary_json`
- 直近ケースの要約
- ユーザーFeedbackから得た軽量な振り返り情報
- `user_pattern_summaries.summary_json`

渡さない、または原則避ける情報:

- 他人のデータ
- 認証情報、access token、refresh token
- DB内部の不要なID
- 過去相談本文の無制限な全文
- 分析に関係しない個人情報

### AI入力の構造例

```json
{
  "currentCase": {
    "eventFacts": "昨日送った予定確認に、相手が「了解」だけ返した",
    "selfMessage": "明日18時で大丈夫？",
    "partnerMessage": "了解",
    "recentConversationText": "前日は普通に会話していた",
    "userEmotion": "不安",
    "concernText": "怒っているのかもしれない"
  },
  "personSnapshot": {
    "displayName": "友人A",
    "relationshipType": "friend",
    "notes": "普段から短文が多い"
  },
  "personProfile": {
    "usualCommunicationStyle": {
      "messageLength": "short",
      "emojiFrequency": "low"
    },
    "relationshipNotes": [
      "普段から短文で返信する傾向がある"
    ]
  },
  "userPatternSummary": {
    "observedPatterns": [
      {
        "label": "短文返信をネガティブに受け取りやすい",
        "confidence": "medium"
      }
    ]
  },
  "instructions": {
    "avoidDiagnosis": true,
    "showReasoningBasis": true,
    "separateUsualAndCurrent": true,
    "focusOnCognitiveReframe": true
  }
}
```

### AI出力の共通方針

AI出力は構造化JSONとする。自由文だけを保存しない。

AIは次を守る。

- 相手の感情を断定しない。
- ユーザーや相手を心理診断しない。
- 「可能性」「入力から見ると」「別解釈」を明示する。
- 判断根拠を入力由来の要素と結びつける。
- 返信文生成より、認知整理と安全な次の行動を優先する。
- 危険、暴力、自傷、ハラスメント等が疑われる場合は、通常の恋愛・友人関係分析より安全確保を優先する。
- `emotionScoreAnalysis` を出力する場合、6項目すべてに `score` と `reason` を必ず含める。

### 出力必須項目

Phase 1以降の `result_json` は次を必須とする。

- `schemaVersion`
- `summary`
- `emotionEstimate`
- `emotionScoreAnalysis`
- `evidence`
- `alternativeInterpretations`
- `notOverreadingReasons`
- `cognitiveReframe`
- `recommendedActions`
- `avoidActions`
- `disclaimer`

Phase 4以降、Person Profileを利用できる場合は次も含める。

- `usualVsCurrent`

## 12. UI仕様

### 結果画面

結果画面では、AIの結論を最上位に置きすぎない。ユーザーが根拠を確認し、自分の受け取り方を調整できる構成にする。

表示順は次を基本とする。

1. ひとこと見立て
2. 悪く見える理由
3. 悪く見すぎなくてよい理由
4. 感情スコア分析
5. 次の安全な行動
6. 別の見方
7. いつもの傾向と今回の違い
8. 受け取り方の整理
9. 避けた方がよい行動
10. 返信文案
11. 振り返り

感情スコア分析では、`怒り気味`, `冷たい`, `距離あり`, `忙しい`, `淡々`, `大丈夫` の6ラベルを固定表示する。`大丈夫` は断定ではなく、「悪く考えすぎなくてよい材料がある」という意味で説明する。

### Person詳細画面

Person詳細画面では、次を表示する。

- 基本情報
- 過去相談一覧
- 普段の返信傾向
- 関係性メモリ
- 最近多い不安テーマ
- Profile再生成ボタン

Profileは断定的に見せない。「この人はこういう人」と表示せず、「過去相談から見える傾向」と表示する。

### ユーザー傾向画面

ユーザー傾向画面では、次を表示する。

- 相談履歴から見える受け取り方の傾向
- 不安材料になりやすい要素
- 役に立ちやすい見方の切り替え
- 要約の再生成
- 要約の削除

この画面は心理診断画面ではない。スコア化やラベル付けがユーザーを固定化しないようにする。

### 文言方針

避ける文言:

- 「あなたは認知が歪んでいます」
- 「相手は怒っています」
- 「相手はあなたを嫌っています」
- 「診断結果」
- 「異常」

使う文言:

- 「入力から見ると」
- 「可能性があります」
- 「別の見方」
- 「普段との違い」
- 「悪く見すぎなくてよい理由」
- 「次に確認できること」

## 13. セキュリティ・プライバシー方針

### 所有権

すべての業務テーブルは `user_id` を持つ。`user_id` は Supabase Auth の `auth.users.id` とする。

APIではクライアントから送られた `user_id` を信用しない。認証済みユーザーIDをサーバー側で取得し、DB条件に含める。

他人の `personId`, `caseId`, `resultId`, `feedbackId`, `profileId` を指定された場合は、存在有無を隠すため `404 RESOURCE_NOT_FOUND` を返す。

### 保存場所

業務データをlocalStorageに保存しない。

保存してはいけないもの:

- 相談本文
- 人物メモ
- AI分析結果
- Feedback
- Person Profile
- User Pattern Summary
- Supabaseセッション情報を独自形式で保存したもの

localStorageに保存してよいものは、テーマ、サイドバー状態、ロケール、チュートリアル既読フラグなど、業務データではないものに限る。

### ログ

ログに次を出さない。

- 相談本文全文
- 人物メモ全文
- AI分析結果全文
- access token
- refresh token
- APIキー
- パスワード相当の秘密情報

障害調査で必要な場合も、ケースID、実行ID、エラーコード、モデル名、処理時間などに限定する。

### 心理診断リスク

KIGEN404は心理診断、医療診断、人格診断を提供しない。

AI出力とUIでは次を守る。

- 相手の内面を断定しない。
- ユーザーの性格や精神状態を診断しない。
- 「傾向」はKIGEN404内の相談履歴から見える利用上の傾向として扱う。
- 不安が強い場合や危険がある場合は、専門家や信頼できる人への相談を促す。
- DV、脅迫、自傷他害、ストーカー、ハラスメントが疑われる場合は安全確保を優先する。

### データ最小化

AIへ渡す過去情報は必要最小限にする。人物ごとの過去相談本文を無制限に渡さず、`person_profiles` の要約や直近ケースの限定的な要約を使う。

ユーザーが将来的にProfileやPattern Summaryを削除できる導線を用意する。

## 14. ファインチューニング・ローカルLLMとの関係

この実装計画は、ファインチューニングやローカルLLMを前提にしない。

初期実装では、外部または既存のLLMに対して、構造化プロンプトと構造化出力を使う。差別化の中心はモデル自体ではなく、次のアプリケーション設計にある。

- 人物ごとの関係性メモリ
- 過去相談と今回相談の比較
- 判断根拠をUIで見せること
- Feedbackによる振り返り
- ユーザーの受け取り方を整える設計

将来的にファインチューニングを検討する場合でも、ユーザーの相談本文や人物メモを学習データに使うには、明示的な同意、削除可能性、利用範囲の説明、法務・プライバシー確認が必要である。

ローカルLLMは、プライバシーやコストの観点で将来検討の余地がある。ただし、初期の差別化機能はローカルLLMなしで実装できる必要がある。

## 15. 実装順序と受け入れ条件

### 実装順序

1. `analysis_results.result_json` の新スキーマを定義する。
2. AIプロンプトを更新し、根拠・別解釈・認知整理を構造化出力させる。
3. 結果UIを更新し、結論より根拠と別解釈を見せる。
4. `analysis_feedbacks` のPrisma schemaとSQL migrationを追加する。
5. Feedback APIとUIを実装する。
6. `person_profiles` のPrisma schemaとSQL migrationを追加する。
7. Person Profile生成・取得APIを実装する。
8. AI入力にPerson Profileを追加する。
9. `usualVsCurrent` をAI出力とUIに追加する。
10. `user_pattern_summaries` のPrisma schemaとSQL migrationを追加する。
11. User Pattern Summary生成・取得・削除APIを実装する。
12. AI入力にUser Pattern Summaryを追加する。

### 共通受け入れ条件

- 自前 `users` テーブルを作っていない。
- `auth_sessions` テーブルを作っていない。
- `password_hash` / `refresh_token_hash` を作っていない。
- 自前JWT発行処理を作っていない。
- `/api/auth/register`, `/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout` を作っていない。
- 追加テーブルが `user_id` を持ち、`auth.users(id)` を参照している。
- クライアントから `user_id` を送らせていない。
- 他人のリソースID指定時は `404 RESOURCE_NOT_FOUND` を返す。
- 業務データをlocalStorageに保存していない。
- 最新分析結果は `version DESC` で取得している。
- `analysis_cases` に最新結果IDを追加していない。
- PostgreSQL固有の制約、trigger、partial index、DESC付きindex、RLS policyがSQL migrationにある。

### Phase別受け入れ条件

| Phase | 受け入れ条件 |
| --- | --- |
| Phase 1 | `result_json` に根拠、別解釈、悪く見すぎない理由、認知整理、安全な行動が含まれ、UIに表示される |
| Phase 2 | Feedbackを作成・取得・更新でき、他人のResultには404を返す |
| Phase 3 | Person Profileを生成・取得でき、人物ごとの傾向がUIに表示される |
| Phase 4 | Profileがある場合に「いつもの傾向」と「今回の違い」が分析結果に出る |
| Phase 5 | User Pattern Summaryを生成・取得・削除でき、心理診断ではなく利用履歴上の傾向として表示される |

## 16. 未確定事項

- `actual_outcome` の列挙値をPostgreSQL ENUMにするか、`varchar + CHECK` にするか。
- `person_profiles` と `user_pattern_summaries` を更新型にするか、`version` 付き履歴型にするか。
- Person Profileの自動再生成タイミングを、分析完了後にするか、Feedback登録後にするか、手動更新中心にするか。
- User Pattern SummaryをAI入力に使う前に、ユーザーの明示的な設定を必須にするか。
- ProfileやPattern Summaryの削除時に、過去の分析結果内に保存済みの要約参照をどう扱うか。
- RLSを必須にするか、バックエンドAPIの所有権検証を主にするか、または両方使うか。
- AI出力JSONの厳密なバリデーション方式を、Zod等のアプリ層検証に寄せるか、DB CHECKも併用するか。
- 危険ケース、DV、脅迫、自傷他害が疑われる相談での専用フローと表示文言。
- 本番公開前の利用規約、プライバシーポリシー、相談内容の運用閲覧範囲。
