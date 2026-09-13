# note自動化：現在地と公開前監査

更新基準: 2026-09-13 / latest main

## 現在の運用状態

この文書は過去の実験経路ではなく、現在のmainから作業を再開するための基準を示す。

完成済み:

- 自動予想収集
- 公式結果収集
- GitHub Actionsによる予想収集・結果収集の異常監視とIssue通知/復旧Close
- 保存予想からのnote原稿生成と公開前監査
- `data/note-publish/latest.json` の自動生成
- `data/note-publish/latest.md` の互換handoff生成
- `data/note-publish/iphone.json` v3の生成
- `iphone.json.canPublish` によるJST当日レース・締切前のfail-closed判定
- `iphone.json` への `freeText` / `paidText` / 初期価格300円の構造化
- note UI transportのタイトル/本文入力、有料切替、300円設定、有料境界設定（最終公開ボタンは未接続）
- PR #939で最終transportの認証をPlaywright保存済み`storageState`方式へ一本化

現在の認証未接続点（iPhoneだけの初回設定を含め未完成）:

- 有効なPlaywright `storageState`を安全に作成・更新し、GitHub Actions Secret `NOTE_STATE_JSON_BASE64`へ登録する接続が未完成。Secretを受け取るコードがあるだけで、iPhoneから初回設定できるとは扱わない。
- 2026-09-13の実行確認ではこのSecretは未設定で、`note_state_missing`としてfail-closedした
- Secret/state本体をリポジトリ、handoff、artifact、Actionsログへ保存しない

その後の未完了:

- 保存済みstateで実サイトeditor到達確認
- 公開しない下書きで300円・有料境界の実サイト確認
- 本番`canPublish === true`レースで公開直前まで確認
- 重複投稿防止と最終公開接続
- 最終transport成立後の旧実験経路・smoke/debug整理

廃止/不採用:

- TinyFishをnoteログイン・投稿経路として使わない。Profile/Vaultを含め再試行しない。
- Browserbaseを現在のnote投稿経路として使わない。停止済みsmoke/live-view/Contextを再有効化しない。
- GitHub-hosted Chromiumで毎回X OAuthする方式を使わない。2026-09-13にheadless/headed(Xvfb)の両方で`note_editor_session_not_ready_note.com`を実サイト確認済み。追加修正・再試行しない。
- `latest.md` が存在することだけを理由にnote-post-mcpを正式transportとみなさない。PR #926は保存済み`note-state.json`を残る接続点として定義したが、state生成・Secret登録までは完成していなかった。

新しいチャットや開発環境では、まず最新main、この文書、`chappy-note-publish` Skill、直近の関連マージPR、`data/note-publish/` の現物を照合する。過去の実験経路から推測で再開しない。

## iPhoneだけでの本人認証と再発防止

- iPhoneの通常ブラウザ、Workのブラウザ、GitHub ActionsのChromiumは別の認証環境。通常ブラウザへのログインを他の環境の認証成功と扱わない。
- ユーザーへPC、開発者ツール、Cookie抽出、`storageState`の手作成を要求しない。初回設定もiPhoneだけで完結することが要件。
- 本人操作を依頼する前に、入力画面が操作可能であることと、そこでの認証を実際の投稿処理が再利用できることを確認する。認証ファイルが未設定というだけで同じ操作を繰り返し依頼しない。
- WorkでのiPhone本人操作と、同一ブラウザの新しいタブでのnote編集画面到達は確認済み。詳細は末尾の確認結果を参照。GitHubへの認証移送と無人実行は未完了。
- 2026-09-13の照合で共有版と個人版のnote公開スキルに差異を確認。関連変更は両方へ反映し、個人版の保存完了まで別に確認する。作業開始時の入口はルート `AGENTS.md`。
- 手順の文章化は補助。投稿可否・実時計でのJST当日判定・締切・停止理由は `validateDraftGate` が実行時に検査し、本文入力と有料設定の直前にも再検査する。CIで締切境界・日付境界・停止理由付きのケースを実行する。

## handoffの役割

`data/note-publish/latest.json` は、保存済みnote原稿から最新の投稿候補を集約する単一handoff。

`data/note-publish/latest.md` はMarkdownを受け取るtransportとの互換用出力。特定のMCPを正式採用したことを意味しない。

`data/note-publish/iphone.json` はスマホ側/最終transportの受け渡し用。v3ではtitle/body/tags/deadlineAt/noteCreateUrlに加え、`freeText`、`paidText`、`price: 300`、投稿可否 `canPublish`、停止理由 `blockReason` を持つ。`canPublish === true` のときだけ本番投稿処理へ進み、falseなら停止する。

## 認証境界

本番transportは `NOTE_STATE_JSON_BASE64` をbase64 decodeしてPlaywright `storageState`として読み込む。stateが未設定、不正JSON、cookie空の場合は停止する。XのID/パスワードをtransportへ渡して毎回OAuthする方式には戻さない。

認証成功の条件は、保存stateを使ったbrowser contextから `https://editor.note.com/new` へ実際に到達し、HTTPSの最終hostが `editor.note.com` で、タイトル欄・本文欄の表示と編集可能状態を確認できること。単にログインhelperが成功を返したことを認証成功扱いしない。

## `canPublish` を混同しない

公開前監査とiPhone handoffでは同じ名前のフィールドが別の責務を持つ。

| フィールド | 意味 |
| --- | --- |
| `article.publishable` / `note.publishable` | 既存の下書き生成条件を満たすか |
| `note.audit.contentReady` | 保存原稿と保存予想の機械検査を通過したか |
| `note.audit.status` | `ready_for_review`、`blocked`、`audit_error` |
| `note.audit.canPublish` | 監査レイヤーでは保存時点の検査を最終公開許可へ昇格させないためfalse |
| `note.audit.automaticPublicationEnabled` | 監査レイヤー単独では自動公開を許可しない |
| `data/note-publish/iphone.json.canPublish` | JST当日レースかつ締切前を確認した、最終transport用の運用ゲート |

`note.audit.canPublish` をtrueに変更してiPhone側へ合わせてはいけない。逆に、古い監査文書の「常にfalse」を理由に `iphone.json.canPublish` を無効化してはいけない。

## 公開前監査の不変条件

`scripts/collect-predictions.js` は選定済みレコードの `note.audit` に監査結果を追加する。既存の `note.publishable` は下書き生成条件であり、最終公開許可ではない。監査失敗時も予想と下書きの保存自体は継続し、監査を `audit_error` として最終投稿を止める。

過去JSON/Markdownを移行・再生成して検査を通したことにしない。保存された予想・原稿・比較用買い目を使う。予想の優先順は 展開 → コース → ST/スリット → 展示/足 → 残し/拾い → 当地/水面 → 技量 → モーター。オッズ未取得を理由に買い目を削除・差し替えない。

監査はレース表示、タイムゾーン付き締切、必要な締切余裕、無料/有料境界マーカー、全文合成、具体的な3連単の無料漏れ、6艇評価、厳選の順序・点数・オッズ、保存予想との整合を確認する。通常予想と参考/万舟台帳を混ぜない。

手動の読み取り検査:

```sh
node scripts/note-publication-audit.js --input audit-payload.json
```

保存bundleをそのまま再検査する場合:

```sh
node scripts/note-publication-audit.js --input data/note-drafts/YYYYMMDD/レースキー-SHA256.json
```

通常の再検査は実時計を使う。過去時点の再現テストだけ `--now` を明示する。保存時の合格判定を現在の公開許可として再利用しない。

## 最終投稿transportのルール

1. 完成済みの予想収集、結果収集、監視、原稿生成、handoffを作り直さない。
2. TinyFish、Browserbase、fresh X OAuthへ戻らない。
3. `NOTE_STATE_JSON_BASE64`はSecretとしてのみ扱い、state/Cookieをリポジトリやログへ出さない。
4. `iphone.json.canPublish === true` を必要条件とし、`blockReason` がある場合は停止する。テストでも本番gateをバイパスしない。
5. title/freeText/paidTextは既存handoffを使い、最終投稿側で予想や買い目を再生成・再解釈しない。
6. 初期価格は300円固定。300〜500円の変動価格は販売が軌道に乗った後の別段階とし、今は混ぜない。
7. 実サイトで公開状態・URL・日時を確認するまでは投稿成功と記録しない。
8. 旧TinyFish/Browserbase/X OAuth等のコード整理は、最終transport成立後に行う。

## 共有Skill

同じSkillを `.agents/skills/` と `.claude/skills/` に置き、`scripts/check-note-skills.js` で一致を確認する。

| Skill | 範囲 |
| --- | --- |
| `chappy-boatrace-dev` | 最新mainを基準に既存機能と未接続部分を区別して開発を継続 |
| `chappy-race-select` | 現行V2選定と保存根拠の確認 |
| `chappy-note-generate` | 保存予想を使った既存原稿生成 |
| `chappy-note-audit` | 公開前の読み取り検査 |
| `chappy-note-publish` | 現在地を固定し、既存handoffから最終transportだけを進める |
| `chappy-note-settle` | 公式結果と保存予想の照合 |

## 検証

```sh
node scripts/test-note-publication-audit.js
node scripts/test-note-draft-bundle.js
node scripts/test-saved-note-draft.js
node scripts/check-note-skills.js
node scripts/test-note-copy-cleanup.js
node scripts/test-note-karatsu-regression.js
node scripts/test-theory-integration.js
node scripts/check-charter.js
```

この文書を更新しても予想ロジック、買い目、UI、収集本体、既存watchdog、handoff生成ロジックは変更しない。

## 2026-09-13 Work本人認証の確認結果

- ユーザーが正規の本人認証画面でGoogleを選択し、その後の本人操作でnoteへログインできた。認証要求の `user_took_over` は失敗と扱わず、本人操作後のnote画面で成功を確認した。
- 同じWorkブラウザの新しいタブから `https://note.com/notes/new` を開き、`editor.note.com` の記事編集画面、記事タイトル欄、本文欄、下書き保存・公開に進むボタンを確認した。本文入力・価格設定・有料境界・公開は未実行。
- Work内の同一ブラウザで認証を再利用できた証拠であり、ブラウザ再作成後の永続性やGitHub Actionsでの無人実行を証明しない。
- 現在公開されているWorkブラウザAPI/機能にはstorageState/Cookieの安全な書き出し・GitHub Secretへの移送機能がない。GitHub接続ツールにもSecret登録機能はない。この経路は本人認証の再試行で解消しない。未公開API、ブラウザ内部ファイル、Cookieの画面出力で迂回しない。
- 再開時は既存Workブラウザのログイン済み画面を先に確認し、認証が失われた証拠がない限り再ログインを依頼しない。GitHub向けの初回登録を進めるには、iPhoneから本人操作でき、認証を無人実行側へ安全に渡す正式機能のある実行環境が必要。採用済みと扱わず、既存の不採用経路へ戻らない。
