# note自動化：共有Skillと公開前監査（第1段階）

この段階では既存の予想・原稿生成を再利用し、公開前の機械検査を追加する。noteへの投稿処理、価格設定、決済、ブラウザ操作、Claude Code呼び出しは実装しない。

## 接続箇所と不変条件

`scripts/collect-predictions.js` は選定済みレコードの `note.audit` に監査結果を追加する。既存の `note.publishable` は下書き生成条件のままで、公開許可ではない。下書き保存条件・原稿本文・買い目・選定条件・UIを変更しない。監査モジュールが失敗しても予想と下書きの保存を継続し、監査を `audit_error` として公開を停止する。

過去JSON/Markdownを移行・再生成しない。新規収集分から日次原本に監査を保存する。軽量要約のnote項目と既存画面には今回追加しない。参考・万舟予測の独立台帳も維持する。

優先順は 展開 → コース → ST/スリット → 展示/足 → 残し/拾い → 当地/水面 → 技量 → モーター。オッズ未取得時に買い目を削除・差し替えて監査を通してはいけない。

## 判定の意味

| フィールド | 意味 |
| --- | --- |
| `article.publishable` / `note.publishable` | 既存の下書き生成条件を満たすか |
| `note.audit.contentReady` | この原稿・保存スナップショット・検査時刻で機械検査を通過したか |
| `note.audit.status` | `ready_for_review`、`blocked`、`audit_error` |
| `note.audit.canPublish` | 現段階は常にfalse |
| `note.audit.automaticPublicationEnabled` | 現段階は常にfalse |
| `note.audit.articleSha256` | 保存するMarkdownと同じ形式のSHA-256。署名・認証ではない |

機械検査はレース表示、タイムゾーン付き締切、120秒以上の余裕、境界マーカー、全文合成、具体的な3連単の無料漏れ、6艇評価の欠落、厳選の順序・点数・オッズを確認する。最大10点まで扱い、候補最大24点や参考・万舟を厳選と混ぜない。生成前の `selectedBase.prediction.practicalTickets` も比較し、記事自身だけを照合元にしない。

意味的な無料漏れ、選手名・根拠の正確性、実際のnote有料境界、最新オッズ、価格・返金設定、重複投稿、権限・利用条件は保証しない。保存された合格判定は将来の公開許可にならない。締切の再検査は公開直前に実時計と最新の公式状態で必要になる。

## 手動の読み取り検査

```sh
node scripts/note-publication-audit.js --input audit-payload.json
```

JSONには `article`、`record`、`baselinePracticalTickets` を渡す。`record` は raceKey/date/jcd/place/raceNo/deadlineAt/prediction.practicalTickets を持ち、baselineは同一収集時点の生成前スナップショットとする。記事からbaselineを複製しない。候補の出典には保存されたprediction.mainSheetのtickets/coverTickets/flowTicketsとmanshuSheet.tickets、参考の出典にはmanshuSheet.forecastLedger.forecastsのformation.notation/expandedTicketsが必要になる。厳選以外も保存根拠のない買い目を許可せず、通常と参考を分けて照合する。任意の設定値は `minLeadSeconds`（120以上）と `maxPracticalTickets`（1〜10）。通常は既存憲章の値を使う。

CLIは入力JSONのnowを無視して現在時刻を使う。`--now ISO_TIMESTAMP` は再現テスト専用である。終了コード0は機械検査合格のみ、1は不備、2は入力等のエラー。ネットワークアクセスやファイル書き込みは行わない。

元の構造化記事や独立した予想が残っていない過去原稿は、完全監査済みとしない。資料不足を報告し、過去データを生成し直して埋めない。

## Claude Code / Codexの共通手順

同じ5つのSKILL.mdを `.agents/skills/` と `.claude/skills/` に配置する。コピー内容は `scripts/check-note-skills.js` とCIで一致を確認する。指示の共有であり、Claude Codeのインストール・認証・実行や常時稼働を代行するものではない。

| Skill | 範囲 |
| --- | --- |
| `chappy-race-select` | 現行V2選定と保存根拠の確認。既存条件を変更しない |
| `chappy-note-generate` | 保存予想を使った既存原稿生成・下書きの準備 |
| `chappy-note-audit` | 公開前の読み取り検査 |
| `chappy-note-publish` | 公開条件の確認と手動引き継ぎ。自動投稿は停止 |
| `chappy-note-settle` | 公式結果と保存予想の照合。予想や学習設定を変更しない |

例：`$chappy-note-audit を使って、指定レースの保存予想とnote原稿を確認して`。対象ファイルと同じ収集時点の比較元を指定する。Skillが使えるかは実行環境で確認し、未実行のモデルを実行済みと言わない。

## 次段階の境界

note公式は公開APIを提供していないため、非公開APIやログインCookieを用いる投稿を追加しない。[note公式ヘルプ](https://www.help-note.com/hc/ja/articles/46643492548121)

公開処理を追加するには、ユーザーが投稿先アカウント、手動/承認付き/無人の範囲、価格、無料/有料境界、投稿時刻、重複投稿台帳、失敗時通知を決め、利用可能で許可された接続方法を確認する必要がある。本PRはその設定を変更せず、定期実行も新設しない。

## 検証

```sh
node scripts/test-note-publication-audit.js
node scripts/check-note-skills.js
node scripts/test-note-copy-cleanup.js
node scripts/test-note-karatsu-regression.js
node scripts/test-theory-integration.js
node scripts/check-charter.js
```
