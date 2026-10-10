# PR下書き: 継続相談・Feedback・パーソナライズの信頼性と画面導線を整備

Base: develop / Head: chore/portfolio-polish-overnight

保存済みの相談を再表示・再試行し、Feedbackを次回に活用する流れで、古い認証応答、
重複作成、分析状態の競合、途中で失敗した履歴読込が操作やデータを不整合にする問題を修正します。
人物別の相談、分析結果・根拠表示、Feedback編集・利用撤回、privacy設定の既存機能をつなぎ、
loading/error/retry、最新5件、行動候補の注意表示、フォームの操作を整えます。

認証・DB・主要Feedback機能にはdevelopで導入済みのものがあります。
このPRはovernightで積み上げた信頼性・UI・契約修正とAstra指摘の対応を統合します。
認証基盤障害は安全な500、AI情報量超過は送信前の422、履歴は失敗・画面離脱・認証変更で取消します。
AI入力は承認済みの64KiB/depth16 Profileと128KiB envelope、出力は各試行32768 tokensです。
暴力助言・診断断定の再現した判定漏れを既存契約の範囲で閉じます。

## Validation

- 全体テスト363/363成功、skip 0。runtime dependency regression6/6、DB harness安全性1/1成功。
- 型チェック、Prisma generate、client/server build成功。clientに大きいchunk警告あり。
- 最終Markdown lint・diff検査成功。
- Astra独立レビュー: 確認範囲に具体的P1/P2統合阻害事項なし。
- 現在Reactと実SDKの合成loopback画面で相談作成、履歴、結果、Feedback更新・利用撤回、privacy保存、A→B分離を確認。
- 実PG suiteはDocker engineが使えず未実行。実Supabase Auth/RLS・実モデル・本番E2Eは未検証。

## Acceptance and follow-up

DB migration/依存更新は今回追加していません。実環境のACL、派生Feedback同意、
横断履歴pagination、依存候補の更新、公開demoの実環境検証は未採用・未完了の項目として記録します。
Profile生成、streaming、完全なpassword recoveryは範囲外です。
推奨されるPG再検証の未実行を受け入れるか、再検証後にmergeするかは統合時の判断です。

詳しい差分・証拠・残る確認手順は[統合記録](astra-remediation-summary.md)を参照してください。
push/PR作成/merge/deployはこの準備作業で実行していません。
