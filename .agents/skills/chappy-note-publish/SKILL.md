---
name: chappy-note-publish
description: チャッピーボートレースAIのnote公開経路を扱う。完成済みの収集・監視・原稿生成・handoffを作り直さず、既存handoffから最終投稿までの未完了部分だけを進める。
---

# チャッピー note公開

## 最初に読む現在地

このSkillを使う時は、チャットや作業環境が変わっていても推測で再開しない。必ず最新main、`docs/note-automation.md`、直近の関連マージPR、`data/note-publish/` の現物を確認し、完成済み・未完了・廃止済みを区別してから作業する。

2026-09-13時点の基準は次の通り。

- 自動予想収集、結果収集、GitHub Actions側の異常監視、note原稿生成は完成済み。作り直さない。
- note投稿handoffは `data/note-publish/latest.json`、`latest.md`、`iphone.json` まで生成済み。作り直さない。
- `iphone.json.canPublish` はJST当日レースかつ締切前を確認する運用上のfail-closedゲート。falseなら投稿処理へ進まない。
- `note.audit.canPublish` は公開前監査レイヤーの別フィールドで、保存時点の監査を公開許可へ昇格させないためfalseを維持している。`iphone.json.canPublish` と混同しない。
- TinyFishは不採用。ログイン、Profile、Vault、投稿経路として再提案・再試行しない。
- Browserbaseは不採用。停止済みのsmoke/live-viewや過去の認証経路を再有効化しない。
- `latest.md` は互換handoffとして残っているが、note-post-mcpを現在の正式な最終transportと決めたものではない。
- 現在の未完了は、既存handoffからnoteの最終投稿へつなぐスマホ完結のtransportと、その実動確認。
- TinyFish/Browserbase/MCP等の不要残骸削除は、最終投稿経路が成立してから行う。先に完成済みhandoffを壊さない。

## 作業ルール

1. 完成済みの予想収集・結果収集・監視・原稿生成・handoffには、最終投稿に必要な不具合が確認された場合以外は手を入れない。
2. note公式の現行仕様と許可された接続方法を実装時点で確認する。非公開API、Cookie抽出、認証回避は使わない。
3. `iphone.json` を使う場合は `canPublish === true` を必須条件とし、`blockReason` がある場合は停止する。title/bodyは既存handoffを利用し、予想や買い目を再生成しない。
4. 投稿先アカウント、無料/有料境界、価格、公開時刻、重複防止、失敗時の扱いなど、最終投稿に必要な未設定条件は推測しない。
5. 実際のnote投稿が成功したと主張するのは、実サイト上で公開状態・URL・日時を確認できた場合だけにする。未確認なら未公開/未確認と明記する。
6. 新しいチャットでは、過去の実験経路から再開せず、この現在地とmainの現物を照合して「残っている続き」だけを進める。

予想の優先順は 展開 → コース → ST/スリット → 展示/足 → 残し/拾い → 当地/水面 → 技量 → モーター。オッズを理由に買い目を変更せず、通常予想と参考/万舟台帳を混ぜない。