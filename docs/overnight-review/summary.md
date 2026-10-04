# Overnight autonomous improvement result

## Executive Summary

2026-10-04 JST、取得した `origin/develop` を基点に専用 worktree で実行した。
Tier A 13件を修正・回帰確認・独立 review・skeptical reviewまで完了。
A05は後続の条件付き承認により、response反映防止の範囲でCompletedへ更新した。
送信前の旧body/新token競合は別P1で未解決。[追補](a05-response-guard.md)参照。
Tier B/C、AI評価、性能は実装可能な部分と
人間判断の境界を分けて準備した。全体を止めるP0は観測されなかった。

A05追補後の最終アプリ検証は151 tests passed、typecheck/build成功。別途、使い捨てPostgreSQLの
7シナリオが成功した。Production変更、DB操作、deploy、merge、push、有料API実行は0。
文書の指摘は現行コードで確認し、未確認の主張をそのまま採用していない。

## Completed

各修正は最小差分と回帰テストを含み、全体gateを通過した。
reviewとskeptical reviewの対象・限界は[reviews](reviews.md)に記録。

| Issue | Change | Evidence | Tests | Commit |
| --- | --- | --- | --- | --- |
| A01 | Feedback最大1000文字に入力契約を統一。切り捨てなし | 501〜1000文字がcontextで失敗する不一致 | 500/501/1000受理、1001拒否、context利用ON/OFF | `7fa7973` |
| A02 | action safetyを保持しsafe/caution/unknownを表示 | normalizationで値が消え全actionが安全風表示 | ViewModel4件、旧形式unknown | `3fdfb7c` |
| A03 / Case-first | 保存直後にCaseへ移動、状態確認後に同じCaseで再試行 | 旧再送フロー、応答喪失・実行中・draft reload | helper4件、実行中は再送せず2秒poll/120秒上限 | `39cb07a` |
| A04 | 設定GET失敗時の保存を禁止、retryを表示 | ONのfallbackを保存できた | 2件、未読込PATCHなし・既存OFF保持 | `3c30dc4` |
| A05 response isolation | 開始時user/epochで成功responseとJSON完了を照合 | guardなしnegative controlは8件失敗、cache/stateへの旧データ反映を再現 | 新規20件、HTTP401/403/409・並列・abort/networkも維持 | `50330f4`＋A05 follow-up HEAD |
| A06 | desktop/mobileからprivacyへ遷移、未実装User Pattern操作を除去 | 導線なし・AI入力に使われないtoggle | source-contract2件 | `34e6b91` |
| A07 | personIdで履歴group・選択・prefillを識別 | 同名Personの混同、名前一致の選択 | ID/mapper7件、同名・旧IDなしfixture | `8260033` |
| A08 | 最新5件を選択、loading/error/retry/emptyを分離 | 7件fixtureで旧コードは古い5件を返した | model2件、session境界も確認 | `128ed38` |
| A09 | 既存FeedbackをGET、ID付きPATCH、保存後も編集可能 | 常にPOSTし既存内容を復元しなかった | model3件、B05で撤回後の次回context除外 | `6d62137` |
| A10 | Feedback更新とProfile stale化を同じtransactionへ | 後段失敗時にFeedbackだけ残る | mock3件＋実DBのPOST/PATCH rollback・retry | `4213a0f` |
| A11 | retry対象・backoffを分類、全試行30秒deadline | 非retryエラー再送と待機時間の上限不整合 | provider mock13件、追加SDK retryなし | `b6a8dff` |
| A12 | malformed JSON=400、100kb超=413、requestIdを統一 | body-parserエラーが内部エラー扱い | HTTP4件、内部情報非公開 | `cbb9dab` |
| A13 | label、fieldset、pressed、pending/error、delete操作を整備 | AST negative controlは3失敗/2成功 | AST5件、browser/a11y監査は未実行 | `f5acd78` |
| B04 repo portion | exact deep-route rewrites、SHA/dirty build metadata | read-only Production GETはlogin/history404 | config契約1件、build metadata確認 | `0fd92d5` |
| B05 local harness | unique loopback/tmpfs PostgreSQL、ID/label限定cleanup | mockだけでは未証明のlock/FK/version/rollback | safety guard1件＋実DB7件、0skip、container残存0 | `f3f620b`, `dbbc28f` |
| B06 audit portion | advisoryのimport経路・成立条件・patch候補を監査 | audit16 affected entries、11high/5moderate | lock/parser/import source review、修復は未実施 | `770f631` |
| Server timing subset | 本文を含めずDB/context/AI/save/totalを計測 | stage不明、補償・logger失敗の影響 | mock5件、成功結果不変・漏えいなし | `acc93b8` |
| Offline AI preparation | baseline/25合成入力/semantic flags/予算計画/stream mock | 現行schemaと入力、公式情報、counterexample | eval/stream8件、offline25件、provider calls0 | `a62dfa9` |
| Performance evidence | 実関数のHistory fanoutとbundle/module attribution | HTTP302/並列100、single chunk921702 bytes | source-backed mock23シナリオ、gzip照合 | `d11db37`, `8edd7a1` |

A03は確認済みCaseの再試行を修正。Case作成自体の応答喪失に対する重複防止は未実装。
A09のprop変更中save状態はsource reviewで修正、実component/browserテストは未実行。
B04/B06は表に記載したrepo fix/auditの完了であり、Production修復・dependency修復ではない。

## Partially Completed

| Issue | Done | Remaining Human Decision |
| --- | --- | --- |
| B01 | field別の既知FP/FN修正、inverse-negation/quote counterexample封じ、17 safety/validation tests | 日本語間接表現・引用FP/FN、診断・危機を含む意味判定policy |
| B02 | owner/run/status/time照合のcutoff明示回復helper、11unit/実DB contention proof | scheduler・担当者・stale threshold・未精算quota予約。API/cron未接続 |
| B03 | context v5 provenance、明示stale/source不明profile除外、7追加tests | 最小証拠数・age・再生成・訂正・派生情報の撤回。metadataは内容の出典忠実性を証明しない |
| B04 live portion | repo route/config/identityを修正、read-only404を記録 | 別途承認したPreview/deployでrouteとartifact identity検証 |
| C01 | 14合成入力、2mock characterization tests、routing提案 | 危機時支援/確認/通常分岐・地域resources・誤routing。runtime policy未採用 |
| C02 | FK/CASCADE、usage SET NULL、archive/JSON/派生snapshotの保持を監査 | account deletion UI、保持/backup/log/provider契約と正確な文言 |
| C03 | A〜F同一合成結果の比較HTML、JS syntax/source review | 意味理解・keyboard/screen-reader/device検証、表示方式選択。ordinal閾値未検証 |
| Luna / Prompt | baseline、比較A〜E、候補1、予算gate・offline runner | 有料gate＋aggregate cap＋実usage管理と人間によるsemantic比較。採用未決定 |
| Streaming | 全体JSON完了/全validation後のみ段階eventを出すmock prototype | incremental parse/safety/早期有用性。runtime/UI/DB接続なし |
| Client timing | 必要な相関と欠測を文書化 | submit/case-create/auth/first-result/completeはNOT_INSTRUMENTED、実測path設計 |

## Skipped

| Issue | Reason |
| --- | --- |
| Paid A/B/C/D/E benchmarks | `ALLOW_PAID_MODEL_BENCHMARK=1`なし、承認済みaggregate capなし。実モデル品質/latency/costはNOT_RUN |
| Production deploy/DB/migration/delete/merge | 明示禁止。外部GitHub write/pushも未実施 |
| Dependency repair | audit scopeは完了。互換patchのlock変更・major/override・Prisma downgradeは未採用 |
| Runtime history/bundle/index/cache/memo optimization | mock timerやbyte量では利用者latency改善を証明できない。query plan/browser/endpoint契約が必要 |
| Real Supabase RLS/GRANT/Data API/Auth deletion | authorized disposable Supabase環境なし。PostgreSQL owner-role/stubでは代用不能 |
| Browser / human UX / real provider validation | 実施していない。source/mock/unit成功と区別 |

## Escalations

[escalations.md](escalations.md)に証拠・選択肢・再開条件を集約。

```text
P0 Human decision: none observed
P1 Human decision: pre-send write-intent race (outside completed A05); B01/C01 safety/crisis semantics;
                   B02 scheduler/quota; B03 source-chain consent;
                   Supabase RLS/GRANT; C02 retention/delete
P2 Later: dependency repair; real browser/performance; Luna/prompt paid gate;
          score UX; deep-route deployment verification
```

## AI / Prompt

- current model: `OPENAI_ANALYSIS_MODEL`→`OPENAI_MODEL`の設定値。isolated環境に設定なし、deployed modelはUNKNOWN。
- evaluated model: 合成mockのみ。current/Luna/none/low実モデルは全てNOT_RUN。
- current prompt result: baselineのinstruction/input/output/schemaを保存。実品質scoreなし。
- optimized prompt result: 候補1を準備、現行への適用なし。338 UTF-8 bytes増は品質改善の証拠ではない。
- Luna adoption decision: **KEEP CURRENT MODEL**。Promptも**KEEP CURRENT PROMPT**。
- unresolved quality risks: unsupported inference、出典忠実性、意味矛盾、診断的表現、個人化OFF、危機と引用FP/FN。
- preliminary budget: Luna単一25request variant、max output3000、retry0、概算$0.093265（framing等除外）。$1は例示値で承認capではない。実token/spend/latencyはnull。

根拠とgateは[model-evaluation](model-evaluation.md)、[prompt-evaluation](prompt-evaluation.md)、
`experiments/ai-evals/README.md`。offline greenはモデル優劣を示さない。

## UX / Performance

- current waiting flow: 以前は保存後もAI完了を待ってから遷移。
- improved flow: Case保存直後に遷移、実状態を表示、再試行前に最新/状態を照合。同じCaseを使用。
- first useful output: Caseの存在/状態は先に見える。AI解釈は最終結果まで待つ。実時間UNKNOWN。
- total output: 実provider end-to-endは未測定。stream prototypeも全JSON validation完了まで公開しない。
- measured bottleneck: History P100/C100で302 requests/並列100、失敗後198追加calls。bundle921702 bytes/gzip262133、単一chunk。
- unknown bottleneck: 本番network/DB/AI内訳、browser parse/render、実利用者の初期/総待機時間。

Historyの69.501msはlocal mockでProduction latencyではない。Recharts449182等は
minify前のrendered charactersでgzip占有率ではない。runtime性能改善は採用していない。
[ai-ux](ai-ux.md)、[performance-followups](performance-followups.md)に制約を記録。

## Verification

```text
npm test: PASS — 151 passed, 0 failed, 0 skipped (base 37; +114)
npm run typecheck: PASS
npm run build: PASS — Vite client + Prisma generate + server tsc
npm run lint:md: PASS — 25 files, 0 issues; A05 follow-up included
```

Windowsでは`npm.cmd`を使用。最終アプリgate後の変更は文書とdiff whitespaceだけ。
追加: disposable PostgreSQL7/7、safety guard1/1、History23シナリオ、
`git diff --check origin/develop`成功。client単一chunk警告は残る。A05追補buildは922.40kB/gzip262.35kB。下記921702bytesの性能計測は追補前commit時点の記録。
最終文書の独立review・skeptical reviewとlintは成功。clean commit後のclient metadata確認は引き渡しchatにも記載する。

## Git

```text
branch: chore/portfolio-polish-overnight
base SHA: 406fc8581a471cedfe4a030845c820b03a4c4f2f
verified prior overnight SHA: 9567801ab8c2ace10a684857b45828fafd57e2e9
final SHA: report-containing HEAD; obtain with git rev-parse HEAD (exact SHA in chat handoff)
commit count: 30 local commits above base (29 preserved + one A05 follow-up)
changed files: 108 tracked paths relative to base
```

`develop`/`origin/develop`はbase SHAのまま、元checkoutの未追跡作業は保存。
no push / no PR / no merge。専用worktreeを残す。全commitとpath一覧は[changes](changes.md)。
final report自身のcommit SHAをそのcommit内に固定すると自己参照になるため、
引き渡しchatに確定したfull SHAを記載する。

## Production Safety

```text
production deploy: NO
production DB write: NO
production migration: NO
production delete: NO
secret exposure: NO
paid benchmark: NO
```

実DBは新規ローカル使い捨てDockerのみ。相談内容は合成fixtureのみ。
env/secret copy、provider実呼出し、既存container操作、major architecture migrationなし。
ProductionはGETによるread-only route確認だけ。

## Tomorrow First 5

1. A05のresponse隔離Completedと別P1の送信前write-intent競合を分け、実auth lifecycle検証と次の責務範囲を判断。
2. B01/C01の引用・間接的強要・危機fixtureをreviewし、安全意味判定/routingを決定。
3. B02のstale threshold、scheduler担当者、quota予約精算を決める。実DB proofは既に準備済み。
4. B03/C02のsource-chain撤回、snapshot保持、account delete、外部retention契約を確認。
5. 合成25入力でLuna/Prompt比較を開始するか、aggregate budget gateと人間採点者を決定。
