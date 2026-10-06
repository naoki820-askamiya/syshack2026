# Astra指摘対応とdevelop統合記録

確認日: 2026-10-06。対象は `chore/portfolio-polish-overnight`。
修正開始点は `c4bea857c6561d905715943c707897044794c9ae`。
確認時のremote developは `406fc8581a471cedfe4a030845c820b03a4c4f2f`、
mainは `d6e19a0ddee7d0261adaa52a786e70eab0a55579`。

ユーザーの依頼はAstra指摘の修正と既存機能のdevelop統合準備です。
既存のovernight harnessに従い、再現、失敗する回帰、最小修正、独立レビュー、
Astraによる再レビューを実施しました。push、merge、deploy、本番DB変更、有料モデル呼出しは未実施です。

## 指摘ごとの結果

| ID | 結果 | 実装・残る判断 |
| --- | --- | --- |
| I01 | 修正・再検証済み | `/api/me`で認証基盤障害を401に変換しない。SDKが返す通信障害・5xxも安全な500。無効JWTの401と未ログインを維持。 |
| I02 | 修正・再検証済み | ProfileのUTF-8 JSONは64KiB・コンテナ深さ16、入力JSON全体128KiB、各試行の出力32768 tokens。超過は送信前の422、切詰めなし。 |
| I03 | 修正・再検証済み | 既存の暴力助言・診断断定拒否契約で再現した英語・日本語の穴を修正。回避助言・否定・引用の対照例を維持。 |
| I04 | 検証手順を準備 | 実SupabaseのGRANT・公開schema・roleが不明。own-row RLSだけでserver管理項目の保護を証明できない。隔離A/B/anon/service検証と最小権限案を別紙に記載。 |
| I05 | 修正・再検証済み | 履歴loadごとの取消・30秒総deadline・失敗時peer取消・auth境界変更時取消。cap4、全成功後のみcache更新、通常GET契約を維持。 |
| I06 | 判断可能な契約案を準備 | 全Person横断のCase投影、created_at/id安定cursor、50件、archive扱い、失敗再試行の案。既存の全件履歴表示からの変更は未採用。 |
| I07 | 同意範囲の判断を整理 | 直接Feedbackの利用撤回は実装済み。過去要約・Profileへの派生利用まで排除するかは別契約。lineageとfail-closed案を別紙に記載。 |
| I08 | 合成ブラウザ検証済み | 現在Reactコードと実SDKをloopbackの偽Auth/APIに接続。相談・Feedback・privacy・A→Bを確認。実DB・実Auth・本番paintの証拠ではない。 |
| I09 | 現行依存・修正候補を確認 | 互換候補と親のexact pin外の更新を区別。Prisma等はomit=devだけでは消えない。未検証overrideや依存更新は採用していない。 |

I01/I05の失敗再現、SDK分類、取消競合の詳細は
[auth/history evidence](astra-auth-history-fixes.md)を参照してください。
I04/I06/I07/I08/I09の具体的なプロトコル、候補、一次資料は
[integration assessment](astra-integration-assessment.md)を参照してください。

## 入力上限と安全性の根拠

初期上限と明示エラーはユーザー承認済みです。JSON byte計数はkey・句読点・escapeを含み、
clone/stringify前に検査します。循環、過深、非JSON値、getter/toJSON等を拒否します。
境界値・超過1byte・Unicode・深さ16/17・巨大配列・送信0回・snapshot前検査を回帰で確認しました。
workflowは上限エラーを422として処理し、状態補償と利用予約の精算を維持します。
providerのincompleteを成功結果として返しません。再試行にも出力上限を付けます。
この上限は料金保証でも、実モデルの品質・遅延保証でもありません。

安全性は既存のregex判定の局所修正です。A25/A26/A27の再現例と近接対照を追加しました。
A29/A30の文字列は現行のtext描画で実行されません。A32の根拠捏造や言い換え全般の
意味的安全性は、schema/regexだけでは証明できません。実モデル評価は未実施です。

## 最終検証

最終ソースで以下を実行しました。テスト環境は鍵・有料実行フラグを継承せず、
DB/Auth URLを到達不能なloopbackへ固定しました。worktreeにenvファイルはありません。
package scriptsと同じCLI/引数をnodeで直接実行した記録です。

| 検証 | 結果 |
| --- | --- |
| npm test相当（backend、frontend regression、AI eval scripts） | 363/363成功、fail/skip/cancel 0 |
| typecheck | 終了0 |
| Prisma generate | 終了0、schema/generated追加入力差分なし |
| client build | 終了0、500kB超chunk警告あり |
| server build | 終了0 |
| runtime dependency regression | 6/6成功 |
| disposable DB安全性テスト | 1/1成功 |
| 実PostgreSQL suite | 未実行。runnerの起動前検査でDocker Linux engine pipe欠落により終了1。 |

Markdown lintと最終diff検査の結果は統合PR下書きに記録します。
今回のPG未実行を以前のPG成功記録で置き換えていません。
fixture画面の詳細は[ブラウザ検証記録](astra-browser-verification.md)を参照してください。

Astraの最終独立判定は、確認した現在コードに残る具体的P1/P2統合阻害事項なし。
所有者条件、client user ID拒否、version DESC、analyze_run_id、snapshot、privacy OFF、
A05、同一Case再試行、短いtransaction、業務localStorage禁止を確認しています。
全体363件と別に101件、最終bounds/AI29件、middleware6件等の独立再検証が成功しました。
これらの件数は全体へ重複加算しません。

## mainから現在までの機能発展

| 機能 | 現在の実装 |
| --- | --- |
| 認証・永続保存 | Supabase Auth、所有者に限定したPerson/Case/ResultのDB保存・取得。登録実環境は未検証。 |
| 継続相談 | Person IDによる同名区別、追加相談、保存結果の再表示、snapshot保持。 |
| 分析表示 | 別解釈、安心材料、不明点、スコア根拠、普段との差、行動候補の注意表示。 |
| Feedback・振り返り | 役立ち度・読みすぎ度・振り返り保存、更新、再表示、利用許可撤回。 |
| 次回文脈 | 許可された保存Profile、同Personの過去Case要約、許可Feedback。privacy OFFを尊重。 |
| 分析失敗の復帰 | 保存済みCaseの状態取得・同一Case再試行、古いrun応答の拒否。 |
| 操作・表示 | 最新5件、loading/error/retry、フォーム、auth切替分離、重複作成防止、履歴取消。 |

認証・DB・主要Feedback等にはdevelopから継承した実装が含まれます。
develop→現在の追加はovernightの信頼性・UI・契約修正と今回のAstra対応です。
新規Profile生成、streaming、完全なpassword recoveryは今回の開発対象ではありません。

## 統合と公開の判断境界

現在developは対象branchの祖先で、確認したbaseでは分岐競合がありません。
ローカルコード統合のレビュー・自動検証は完了しました。
推奨される使い捨てPG再検証は環境制約で残ります。実行条件は起動済みDockerと
cached postgres:17-bookwormです。`node scripts/db-integration/run.mjs`で再実行します。
このrunnerはpull、env読込、Supabase接続、本番DB変更を行いません。

公開前には実Supabase Auth/ACL/RLS、実モデル品質・予算、本番deep link/build identity、
同意説明と派生利用方針、実運用package、実測UXが別途必要です。
これらをdevelop mergeの必須条件にするかは受入判断です。ローカルテストを本番証明と扱いません。
GitHubへの書込み直前にはremote HEAD・CI・review threadsを再確認してください。
