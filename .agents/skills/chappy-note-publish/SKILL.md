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
- `iphone.json` はv3。`freeText` / `paidText` / 初期価格300円を持ち、`canPublish` はJST当日かつ締切前だけtrueになるfail-closedゲート。
- note UI transportにはタイトル/本文入力、有料切替、300円設定、有料境界設定まで実装済み。最終公開ボタンはまだ押さない。
- `note.audit.canPublish` は公開前監査レイヤーの別フィールドで、保存時点の監査を最終公開許可へ昇格させないためfalseを維持する。`iphone.json.canPublish` と混同しない。
- TinyFishは不採用。ログイン、Profile、Vault、投稿経路として再提案・再試行しない。
- Browserbaseは不採用。停止済みsmoke/live-viewやContext認証経路を再有効化しない。
- GitHub-hosted Chromiumでのfresh X OAuthは2026-09-13にheadless/headed(Xvfb)の両方で `note_editor_session_not_ready_note.com` を確認済み。追加修正・再試行しない。
- 現在の認証境界はPlaywrightの保存済み`storageState`。GitHub Actionsでは `NOTE_STATE_JSON_BASE64` Secretからのみ読み込み、認証state/Cookieをリポジトリやログへ保存しない。
- PR #939で本番transportから`X_LOGIN_ID` / `X_PASSWORD` / `loginNoteViaX`依存を削除し、保存済みstate方式へ一本化済み。
- 2026-09-13のstate smokeで `NOTE_STATE_JSON_BASE64` が未設定 (`note_state_missing`) と確認済み。コード側の次の未接続点は、有効な`note-state.json`相当のstorageStateを安全にこのSecretへ登録することだけ。
- PR #926は`latest.md`を作り、保存済み`note-state.json`が残る接続点だと定義したが、stateそのものの生成・Secret登録は実装していなかった。完了済みと誤認しない。
- 最終transport成立後に、TinyFish/Browserbase/旧X OAuth等の不要残骸を整理する。先に完成済みhandoffを壊さない。

## 作業ルール

1. 完成済みの予想収集・結果収集・監視・原稿生成・handoffには、最終投稿に必要な不具合が確認された場合以外は手を入れない。
2. TinyFish、Browserbase、GitHub-hosted fresh X OAuthへ戻らない。同じ失敗方式を名前や実行形態を変えて再試行しない。
3. `NOTE_STATE_JSON_BASE64` はPlaywright storageStateをbase64化したSecretとして扱う。Cookie/state本体をコミット・artifact・ログ・handoffへ出さない。
4. `iphone.json.canPublish === true` を本番投稿の必要条件とし、`blockReason`がある場合は停止する。テスト目的でも本番gateをバイパスしない。
5. 本文は既存`freeText`/`paidText`を使い、予想・買い目を最終transportで再生成しない。初期販売価格は300円固定。300〜500円変動は販売が軌道に乗った後の別段階。
6. 実際のnote投稿が成功したと主張するのは、実サイトで公開状態・URL・日時を確認できた場合だけ。未確認なら未公開/未確認と明記する。
7. 新しいチャットでは、まずこのSkillと最新mainを照合し、現在の唯一の認証未接続点から続ける。過去の実験経路から再開しない。

予想の優先順は 展開 → コース → ST/スリット → 展示/足 → 残し/拾い → 当地/水面 → 技量 → モーター。オッズを理由に買い目を変更せず、通常予想と参考/万舟台帳を混ぜない。
