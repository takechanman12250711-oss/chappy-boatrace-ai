# LINE接続確認

2026-09-29、本人がLINE公式 @009mdbvr を作成し、再発行した長期アクセストークンをGitHub Actions Secret `LINE_CHANNEL_ACCESS_TOKEN` に保存したと報告。

`Check LINE connection` はmain更新または手動で、保存Secretを使い公式APIのbot情報・当月上限目安・利用概算をGETする。基本ID一致を必須とし、Secret、個人ID、APIエラー本文をログへ出さない。PRでは資格情報なしのテストだけを実行する。

APIの上限には追加有料枠も含まれ、無料プランの証明ではない。このworkflowはメッセージを送信せず、課金設定も変更しない。接続成功、API送信受付、本人端末の受信確認は別段階として報告する。

本人の友だち追加と送信先確認、本人だけへのテスト送信は完了し、2026-09-29に本人が「届いた」と受信を確認した。21:20 JSTの「両方同時配信で進めたい」により、1日1回案をXと同じ的中速報の同時配信へ変更する。実装・重複防止・有効化条件は `docs/note-hit-reporting.md` を参照。X配信は未接続のままで、configが無効の間は両媒体とも本番配信しない。

公式仕様: https://developers.line.biz/en/reference/messaging-api/#get-bot-info と同ページのquota/consumption。

## 本人への初回テスト

本人が友だち追加と `LINE_TEST_USER_ID` の保存を完了したと報告したため、`LINE owner onboarding test` をmain反映時に1回実行する。PRはモックテストのみ。本人指定Secretの個人ID、固定bot基本ID、プロフィール取得結果、利用上限200通以下かつ残数ありを確認する。プロフィール内容・ID・鍵は記録しない。

送信前に `line-onboarding-test/v1` タグを原子的に作成し、固定文面1通だけをpushする。LINEのretry keyも付ける。送信失敗・結果不明でもタグを消さず、自動再送しない。タグは試行記録であり成功証拠ではない。成功ログのrequest IDはAPI受付の証拠で、本人端末への受信は本人の返信で確認済み。同時配信の本番確認とは区別する。

## 2026-09-29 最新方針: LINEは無料の閲覧メニュー

X速報はBuffer Freeへ移し、LINEの同時broadcastは運用しない。既存の `LINE_CHANNEL_ACCESS_TOKEN` は `setup-line-menu.yml` のメニュー設定だけに使う。「今日の予想」「結果を見る」は既存の日次note一覧を開くURIアクションで、配信メッセージは送らない。詳細・本人接続の残作業は `docs/note-hit-reporting.md` の最新節。設定成功とiPhone実表示確認は区別する。
