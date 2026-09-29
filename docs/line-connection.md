# LINE接続確認

2026-09-29、本人がLINE公式 @009mdbvr を作成し、再発行した長期アクセストークンをGitHub Actions Secret `LINE_CHANNEL_ACCESS_TOKEN` に保存したと報告。

`Check LINE connection` はmain更新または手動で、保存Secretを使い公式APIのbot情報・当月上限目安・利用概算をGETする。基本ID一致を必須とし、Secret、個人ID、APIエラー本文をログへ出さない。PRでは資格情報なしのテストだけを実行する。

APIの上限には追加有料枠も含まれ、無料プランの証明ではない。このworkflowはメッセージを送信せず、課金設定も変更しない。接続成功、API送信受付、本人端末の受信確認は別段階として報告する。

次は本人の友だち追加と送信先確認、本人だけへのテスト送信、その受信確認を行う。日次配信は既存 `note-marketing-state` の根拠付き原稿を利用し、1日1回・無料枠・永続的な重複防止を実装してから有効化する。X配信は未接続のまま。

公式仕様: https://developers.line.biz/en/reference/messaging-api/#get-bot-info と同ページのquota/consumption。

## 本人への初回テスト

本人が友だち追加と `LINE_TEST_USER_ID` の保存を完了したと報告したため、`LINE owner onboarding test` をmain反映時に1回実行する。PRはモックテストのみ。本人指定Secretの個人ID、固定bot基本ID、プロフィール取得結果、利用上限200通以下かつ残数ありを確認する。プロフィール内容・ID・鍵は記録しない。

送信前に `line-onboarding-test/v1` タグを原子的に作成し、固定文面1通だけをpushする。LINEのretry keyも付ける。送信失敗・結果不明でもタグを消さず、自動再送しない。タグは試行記録であり成功証拠ではない。成功ログのrequest IDはAPI受付の証拠で、本人端末への受信は本人の返信で別途確認する。自動の日次配信・X配信はまだ有効化しない。
