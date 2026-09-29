# LINE接続確認

2026-09-29、本人がLINE公式 @009mdbvr を作成し、再発行した長期アクセストークンをGitHub Actions Secret `LINE_CHANNEL_ACCESS_TOKEN` に保存したと報告。

`Check LINE connection` はmain更新または手動で、保存Secretを使い公式APIのbot情報・当月上限目安・利用概算をGETする。基本ID一致を必須とし、Secret、個人ID、APIエラー本文をログへ出さない。PRでは資格情報なしのテストだけを実行する。

APIの上限には追加有料枠も含まれ、無料プランの証明ではない。このworkflowはメッセージを送信せず、課金設定も変更しない。接続成功、API送信受付、本人端末の受信確認は別段階として報告する。

次は本人の友だち追加と送信先確認、本人だけへのテスト送信、その受信確認を行う。日次配信は既存 `note-marketing-state` の根拠付き原稿を利用し、1日1回・無料枠・永続的な重複防止を実装してから有効化する。X配信は未接続のまま。

公式仕様: https://developers.line.biz/en/reference/messaging-api/#get-bot-info と同ページのquota/consumption。
