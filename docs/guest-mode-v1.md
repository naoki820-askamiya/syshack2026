# ゲスト1回の実装と公開ゲート

ゲスト専用の資格・API・入力画面を実装しています。既定はOFFです。本番導入、料金・保持方針・法務文面の承認を意味しません。ゲスト資格ごとにアプリからproviderへ最大1送信であり、成功保証や「1人1回」の保証ではありません。

## 無効状態

`GUEST_V1_ENABLED` の既定は未設定です。`GUEST_V1_RELEASE` に対応する承認済みrelease registryも現在は空です。flagだけを変更しても発行・新規分析は拒否します。未承認のゲスト同意文面、価格、model、token計数方式を環境変数から注入できません。通常ユーザーのAI設定へのfallbackはありません。

さらにDBの `guest_v1_budget` の固定scope `guest-v1` は停止状態・上限NULLでseedします。全体金額B、総件数N、同時C、発行総数、短期発行数が未設定・不正なら受付しません。再起動・日付更新・Cookie発行で予算をresetしません。金額は整数micro単位の最大予算占有で、実請求額ではありません。

対応modelの完全なwire request（固定instructions、schema等も含む）について検証済みのtoken上界と最悪料金が必要です。文字数・byte数を根拠なくtokenに換算しません。実モデル、料金version、tier/region/cache条件、価格の上方向丸めの根拠が未承認の間、registryを空のままにします。テスト用release/providerは依存注入でのみ使用し、公開APIにoverrideはありません。

## 所有権とAPI

通常ユーザーのBearer認証、同意、人物・相談・履歴・Feedback APIは維持します。ゲストに通常userIdを発行・共有しません。過去文脈は空です。登録は任意の通常リンクで、claim、自動移行、初回credit統合はありません。

| API | 動作 |
| --- | --- |
| GET `/api/guest/config` | 公開可能なreleaseと受付状態のみ。OFF時はenabled:false |
| POST `/api/guest/session` | 明示操作で資格発行。上限チェック。同Cookieは再利用 |
| GET `/api/guest/session` | Cookie所有者の状態取得のみ。未発行404。発行・分析なし |
| POST `/api/guest/consent` | 資格に対するexact terms/privacy/guest版とaccepted、サーバー時刻 |
| POST `/api/guest/analyze` | 入力・intentを検証し、予約と送信許可後だけ1送信 |
| GET `/api/guest/result` | 所有する結果の取得のみ |
| DELETE `/api/guest/content` | 削除印を確定し本文・結果を読めなくする |

資格は32byte乱数のhost-only HttpOnly Cookie、DBはhashのみです。HTTPSではSecureと`__Host-` prefix、SameSite=Strict、Path=/を使います。HTTP例外は明示したlocalhost開発releaseだけで、本番へ波及させません。書込みはexact Origin、JSON、発行後は別CSRF値が必須です。Cookieを返送できないbrowserでは開始せず案内します。Cookie/本文をURL、log、analytics、localStorageへ置きません。結果・状態はprivate/no-storeです。

同一originを優先します。現在の通常APIはVITE_SERVER_URLで別originにもなり得るため、実配備でCookieを安全に返送できる構成は公開前の確認事項です。任意X-Forwarded-Forは使わず、trusted proxy未確定のv1ではIPを本人識別や追加枠の根拠にしません。全Cookieが新規でも共有DBの全体上限が効きます。盗まれた有効Cookieの悪用を完全識別できるとは主張しません。

## 状態と原子性

資格、run、予算、receiptを専用tableで分けます。全mutationは固定の予算rowを先にlockします。資格と費用・件数・同時枠を同一transactionで予約し、同一guest/intentのfingerprint違いは409。同一intentは保存済みrunを返し、配備・設定変更を理由に再生成しません。

`RESERVED → DISPATCH_AUTHORIZED → SUCCEEDED / FAILED_TERMINAL / UNKNOWN`

送信許可は別transactionで停止・削除・期限・同意と実行者を再確認し、CASします。commit成功を確認した実行者だけがtransaction外で1送信します。許可commitの応答が不明なら推測送信しません。SDK retry=0、アプリretry=0。DB保存の再試行は同じ結果の保存だけでproviderを呼びません。通常ユーザー向けの最大3試行は維持します。

送信前の取消はCAS後にreceiptの予約を一度だけ返し、古い実行者をfenceします。送信許可以降の最大費用・件数は成功時も保持します。完全なprovider終端応答が確認できた場合だけ同時枠を返します。通信切断、不完全body、local timeout、成否不明はUNKNOWNとして費用・件数・同時枠を保持し、全体受付を停止します。

backend起動時は、承認済みreleaseが有効な場合だけ回復処理を行います。残ったRESERVEDをCAS取消し、送信許可済みの未完了runをUNKNOWNへ移して停止します。回復できなければゲストを停止し、通常ユーザー経路を維持します。他instanceの実行中runも安全側に停止扱いとなり得ます。遅い終端応答で同時枠を返せても受付は自動再開しません。可用性より未知課金の保守的保持を優先する小規模v1の判断です。

## 保持・削除・掃除

本文TTLと使用済み識別期間は別の保存値です。24h/30d等は開発fixtureの候補で、承認済み公開方針ではありません。使用済み期間の起点は初回の送信許可時刻です。初期Cookieは未使用資格期間と使用済み期間を覆う長さとし、送信許可の応答を失っても24hで識別だけ消える抜けを防ぎます。閲覧で期限を延長しません。

削除・期限後は読み取り時点で内容を隠し、遅い完了の保存も拒否します。削除印、失効、runを条件に更新するため本文は復活しません。`createGuestRepository(...).cleanup()` は期限切れ本文の物理消去、識別hashの期限消去、送信前予約のCAS取消と期限切れ未完了runのUNKNOWN化を行います。必要最小限の会計receiptと匿名の関連IDは残し、予算を返しません。本番schedulerは設定していません。保持方針、物理掃除の実行頻度・失敗検知・会計記録の保持は公開前に確定が必要です。

## 検証と公開前の残件

unit/HTTPの合成providerテストと、実PostgreSQL用の並列・障害テストを分けます。SQL mockの合格は実DBの原子性証明ではありません。実DBの実行可否と最終commitの証拠は作業報告を参照してください。実モデル品質、料金、配備済みRLS/GRANT、実Cookie/proxy、負荷とcleanup運用は別の公開ゲートです。

実額B・N・運用担当・UNKNOWN照合/停止手順、実model/料金/token上界、保持方針、運営・問い合わせ先、guest同意文面と既存法務3段落、配備origin/cookie/CSRF/proxyとDB権限の承認までは、本番を有効化しません。未承認文案を通常のlegalページへ公開していません。
