# 合成ブラウザ検証記録

確認日: 2026-10-06。実際の現在React/Routerコードとインストール済みSupabase SDKを使用。
Auth REST・business API・分析結果はloopbackのみの合成fixtureです。
実DB、provider、production backendは接続していません。
fixtureには鍵を継承せず、CSPで外部接続・resourceを遮断しています。

## 観測した結果

1. Aでログインし、AだけのPerson/相談をHome・Historyで表示。
2. privacy画面でpersonalizationをOFFに保存。fixtureでA=false、B=trueを確認。
3. 新しいPersonとCaseを作成し、合成分析結果へ遷移。
   根拠・不確実性・確信度の注意表示、行動候補の注意表示を確認。
4. desktopでAをlogoutし、同じSPAでBにlogin。
   Aの行動画面へのreturnToは404、HomeはBだけのPerson/相談を表示。
5. Bの保存済み分析で役立ち度4・読みすぎ度2・合成振り返り・利用許可を保存。
   成功メッセージと「Feedbackを更新」を確認。
6. 振り返りを編集し利用許可をOFFに更新。Historyから再表示して編集内容・OFFの保持を確認。
7. 更新ボタンからTabで行動ボタンへfocusが移ることを確認。

1280x900のdesktop breakpointでlogout導線を確認し、終了時にviewport overrideをresetしました。
これは包括的なkeyboard/screen-reader/mobile監査ではありません。
最初のfixture server停止時に読込失敗が発生し、loopback接続拒否を確認してroot所有serverで再起動しました。
再起動後の相談作成、privacy、A→B、Feedback保存・更新は最終request ledgerに記録しています。
server停止由来の失敗をproductの不具合と扱っていません。

## 証跡と限界

実行artifact directoryにはfixture script/seed、browser-summary.json、
browser-analysis.jpg、browser-feedback.jpgがあります。summaryは合成データと
method/path/actor/timeのledgerのみで、実ユーザー情報・token・bodyを記録しません。
fixture dataはmemory内であり、この成功は永続DB保存の証明ではありません。
実登録・mail・realAuth・RLS・実AI・本番deep routesは未検証です。
dev表示でありproduction bundleのcold/warm useful-paintやp50/p95は測定していません。
I05のsocket取消や大量履歴性能はここで実測しておらず、別の決定的I/O回帰を参照します。
