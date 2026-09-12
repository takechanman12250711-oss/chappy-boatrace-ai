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
- `data/note-publish/iphone.json` のiPhone向けhandoff生成
- `iphone.json.canPublish` によるJST当日レース・締切前のfail-closed判定

未完了:

- 既存handoffからnoteの最終投稿までをつなぐ、スマホ完結のtransport
- 実サイトでの最終投稿成功確認
- 最終transport確定後の不要な旧実験経路・smoke/debugの整理

廃止/不採用:

- TinyFishをnoteログイン・投稿経路として使わない。Profile/Vaultを含め再試行しない。
- Browserbaseを現在のnote投稿経路として使わない。停止済みsmoke/live-viewを再有効化しない。
- `latest.md` が存在することだけを理由にnote-post-mcpを正式transportとみなさない。

新しいチャットや開発環境では、まず最新main、この文書、`chappy-note-publish` Skill、直近の関連マージPR、`data/note-publish/` の現物を照合する。過去の実験経路から推測で再開しない。

## handoffの役割

`data/note-publish/latest.json` は、保存済みnote原稿から最新の投稿候補を集約する単一handoff。

`data/note-publish/latest.md` はMarkdownを受け取るtransportとの互換用出力。特定のMCPを正式採用したことを意味しない。

`data/note-publish/iphone.json` はスマホ側の受け渡し用で、title/body/tags/deadlineAt/noteCreateUrlに加え、投稿可否を `canPublish` と `blockReason` で返す。`canPublish === true` のときだけ次の投稿処理へ進み、falseなら停止する。

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
2. `iphone.json.canPublish === true` を必要条件とし、`blockReason` がある場合は停止する。
3. title/bodyは既存handoffを使い、最終投稿側で予想や買い目を再生成・再解釈しない。
4. note公式の現行仕様と許可された接続手段を実装時に確認する。非公開API、Cookie抽出、認証回避は使わない。
5. 投稿先アカウント、無料/有料境界、価格、投稿時刻、重複防止、失敗時の扱いを推測しない。
6. 実サイトで公開状態・URL・日時を確認するまでは投稿成功と記録しない。
7. 旧TinyFish/Browserbase等のコード整理は、最終transportが成立してから行う。

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