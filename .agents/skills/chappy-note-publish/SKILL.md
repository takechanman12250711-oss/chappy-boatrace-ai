---
name: chappy-note-publish
description: チャッピーボートレースAIのnote公開経路を扱う。完成済みの収集・監視・原稿生成・handoffを作り直さず、既存handoffから最終投稿までの未完了部分だけを進める。
---

# チャッピー note公開

## 2026-09-13 Browser Use接続の確認済み現在地

同日、本人が販売者情報を登録後、Workの非公開テスト下書き「動作確認用・公開しない」（n9bed34c034d9）で本文保存、価格300円、無料文と有料文の間の選択済み境界を実画面確認した。価格欄は input#price、有料切替は完全一致で指定する。境界は有料先頭段落の全文一致が一意であること、直前のwidget、選択後のaria-pressedを検証する。共通祖先内の最初のボタンや40文字の部分一致を使わない。これはWorkでの実サイト確認であり、Actionsのdraft無人成功や公開の証明ではない。投稿ボタンは未操作。再ログイン・本人情報再登録を新たな失敗の証拠なしに要求しない。

この節を以下の旧storageState接続記録より優先する。PR #945で認証経路をBrowser Use保存profileへ変更済み。GitHub Secretsは `BROWSER_USE_API_KEY` と `BROWSER_USE_PROFILE_ID`。旧 `NOTE_STATE_JSON_BASE64` の登録、Cookie抽出、本人ログインのやり直しを要求しない。

ユーザーがiPhoneで両Secretを登録し、mainのauth実行34760871901（2026-09-13 13:50 UTC）で `NOTE_UI_PROFILE_LOADED=true`、`NOTE_UI_EDITOR_READY=true` を確認した。GitHub Actionsから保存profileを再利用してnote編集画面へ到達した証拠である。本文入力・300円・有料境界・公開は未確認/未実行。

次は実時計で有効な既存handoffだけを使ってdraftを検証する。期限切れなら停止し、日時やcanPublishを書き換えて検証を通さない。最終公開は未実行方針を維持する。新しい認証失敗の証拠がない限り本人操作を再要求しない。

原稿生成workflow `Build note publish handoff` がmainで成功すると、note transportが自動でdraftを開始する。実行時は最新mainのhandoffを読み、期限切れ・停止理由付き・既存のレース予約ありの場合はブラウザ起動前に見送る。読み取り失敗は停止する。事前確認後も原子的な予約と実時計ゲートを再検査する。完了済みの収集・原稿生成は作り直さず、手動のauthを毎回要求しない。自動開始の設定と実際の下書き成功を区別し、Actions Summaryのskipを成功投稿と扱わない。最終公開は無効のまま。

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
- 2026-09-13のstate smokeで `NOTE_STATE_JSON_BASE64` が未設定 (`note_state_missing`) と確認済み。未接続点は、iPhoneだけで本人認証を完了し、その有効なstorageStateを安全にこのSecretへ登録する経路。Secret受け取り側の実装を初回設定の完成と混同しない。
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

## iPhone要件と完了の証拠

- `AGENTS.md` と `docs/note-automation.md` のiPhone要件を守る。PC・開発者ツール・Cookie抽出・state手作成を本人へ丸投げしない。
- 本人操作は、その画面が操作可能であり、認証を対象の投稿処理が再利用できる根拠を確認してから依頼する。通常ブラウザ、Work、GitHub Actionsのログイン状態を混同しない。
- 実装済み、実サイト確認済み、iPhone本人操作確認済み、無人実行確認済み、公開済みを分ける。画面のhostやhelper成功だけで認証完了としない。
- 個人版と共有版が違う場合は最新mainとユーザーの既決事項を照合して修正する。個人版の保存確認を省いて更新済みと報告しない。

## 2026-09-13 Work本人認証の確認結果

- ユーザーが正規の本人認証画面でGoogleを選択し、その後の本人操作でnoteへログインできた。認証要求の `user_took_over` は失敗と扱わず、本人操作後のnote画面で成功を確認した。
- 同じWorkブラウザの新しいタブから `https://note.com/notes/new` を開き、`editor.note.com` の記事編集画面、記事タイトル欄、本文欄、下書き保存・公開に進むボタンを確認した。本文入力・価格設定・有料境界・公開は未実行。
- Work内の同一ブラウザで認証を再利用できた証拠であり、ブラウザ再作成後の永続性やGitHub Actionsでの無人実行を証明しない。
- 現在公開されているWorkブラウザAPI/機能にはstorageState/Cookieの安全な書き出し・GitHub Secretへの移送機能がない。GitHub接続ツールにもSecret登録機能はない。この経路は本人認証の再試行で解消しない。未公開API、ブラウザ内部ファイル、Cookieの画面出力で迂回しない。
- 再開時は既存Workブラウザのログイン済み画面を先に確認し、認証が失われた証拠がない限り再ログインを依頼しない。GitHub向けの初回登録を進めるには、iPhoneから本人操作でき、認証を無人実行側へ安全に渡す正式機能のある実行環境が必要。採用済みと扱わず、既存の不採用経路へ戻らない。
