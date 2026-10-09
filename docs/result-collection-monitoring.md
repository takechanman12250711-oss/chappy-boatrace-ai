# 結果収集と監視

公式結果収集・校正・異常通知は GitHub Actions で実行する。Work/ChatGPT の常時ポーリングを再作成しない。

## 中央の保存順

`collect-results.yml` 自体は `chappy-result-pipeline` で世代を直列化する。このworkflow内では、共有 `chappy-main-data-writers` は取得済み公式原本の照合保存と2つの成果物保存jobだけが保持する。重い診断・校正・事前検査は contents: read で実行し、予想収集の待機列を占有しない。既存scheduleを維持し、新しい定期writerやWork監視は追加しない。

1. `verify` は既存の回帰検査を行う。
2. `fetch_results` が公式結果だけをキュー外で取得し、固定日付と検査付きartifactを渡す。`collect` は最新mainに公式結果を検査・適用し、`repair-recent-results.js --sources-only --match-only` で最新の予想と照合する。原本に付くreview・理論評価・外れ原因・展開AI v6照合を更新し、indexを再生成して、公式結果と圧縮予想原本を先行checkpointする。v6照合は同じ対象日から直近3日を扱い、夜間に日付が変わっても前日分を保存する。照合は結果後の検証情報だけを追加し、保存予想・買い目・自動採用は変更しない。診断側で照合後に古いarchiveを復元して情報を失う順序に戻さない。この照合・保存jobは共有writerキューを保持する。取得後の実時間は本番runで別途確認する。
3. `diagnostics` は `collect.saved_sha` を復元し、既存の重い分析・参考統計・整合性検査を行う。検査済みのstatsと参照タグ成果物だけを元blob・SHA256・入力SHA付きartifactへ渡す。予想/結果原本に未保存変更があれば停止する。
4. `publish_reports` はそのartifact IDだけを取得し、共有writerキュー内で最新mainと照合する。許可したレポートの元blobが同じ場合だけ反映する。計算中に増えた予想・結果・note原稿は触らない。生成コードが変わった場合、または同じ診断成果物が変わった場合はbatch全体を失敗させ、古いJSONを自動mergeしない。独立したpractical-priority-shadow-reportだけは予想収集側の新しい版を保持して記録する。
5. `calibrate` は `publish_reports.saved_sha` を復元し、既存の校正と整合性検査を行う。`publish_calibration` が同じ照合方法で短時間保存する。既存builderが作る `data/predictions/calibration.json` と `data/predictions/improvement-review.json` は派生レポートとして校正stageだけに明示登録する。diagnostics stageや他の予想ディレクトリ内ファイルには許可を広げない。元blob・入力SHA・内容hash・コード競合の検査は同じで、sparse checkout外でも検査済みの正確な2パスだけをstageできるようにする。日次予想・公式結果・source archiveは引き続き保存対象外であり、未保存変更があれば停止する。

共有キュー外の計算は保存済みSHA時点の分析であり、計算中に追加された最新予想まで含むとは扱わない。`data/stats/result-diagnostics-checkpoint.json` と `result-calibration-checkpoint.json` に入力SHA、反映直前SHA、反映ファイルhash、新しい版を保持した対象を記録する。許可範囲外の原本や記事をartifact経由で保存しない。

派生レポートのpushが他の変更に先を越された場合は最新mainとの照合だけを最大3回繰り返す。予想の先行保存は `pull --rebase --autostash` とpushを最大3回行う。公式原本は下記の取得artifact再検査と検査済みrefへのrebase・pushを最大3回行う。同じファイルのrebase競合は自動解決せず停止する。強制pushや共有キュー内での重い再計算は行わない。競合・生成失敗・artifact不足を成功に置き換えない。先行保存済みの公式結果は残り、GitHubの失敗job再実行、または次の既存定期実行で再開する。コードや同じレポートが変わった競合は現在のmainからの再生成が必要。

予想収集も `predict` の保存までだけ共有writerキューを保持し、その後の非必須回帰検査は保存済みSHAを読む `regression` jobへ分離する。予想基準・買い目・自動採用条件・noteの締切条件は変更しない。

検証: `node scripts/test-result-report-checkpoint.cjs`（競合、更新された原本の保持、改ざんartifact、push中の更新、job境界）。GitHub concurrencyのjob単位制御とartifact IDは公式機能を使用する。

## 6つの監査workflowの計算・保存分離

次の既存workflowも `diagnostics` → `publish_reports` に分ける。レポートbasenameをcheckpoint profileとして使用する。

- `check-local-water-strong-condition-cohort.yml` → `local-water-strong-condition-cohort`
- `check-local-water-outer-head-candidate-ranking-audit.yml` → `local-water-outer-head-candidate-ranking-audit`
- `check-outer-head-drop-stage-audit.yml` → `outer-head-drop-stage-audit`
- `check-local-water-outer-head-stage-audit.yml` → `local-water-outer-head-stage-audit`
- `check-local-water-main-head-selection-audit.yml` → `local-water-main-head-selection-audit`
- `check-local-water-result-breakdown.yml` → `local-water-result-breakdown`

workflow全体はそれぞれ固有のconcurrency groupと `queue: max`・`cancel-in-progress: false` で世代を直列化する。計算jobは `contents: read`、`persist-credentials: false`、`fetch-depth: 1` とし、実際にcheckoutした `git rev-parse HEAD` を入力SHAとして固定する。既存の検査と `restore-daily-prediction-source.js --all` → builder → `prepare-daily-prediction-git-save.js --all` は計算側だけに残す。breakdownの12分制限を維持し、他の5本は従来のGitHub Actions既定上限と同じ360分を明記する。短い保存jobの上限は10分とする。

packはprofileに対応する `data/stats/<profile>.json` だけをartifactへ含める。prepareは予想ファイルをstageする処理を含むため、作業ツリーだけでなくindexに残った変更も調べる。日次予想・公式結果・source archive・予想index等の原本に未保存変更があれば停止する。復元用JSONやarchiveを監査レポートと一緒に保存しない。artifact名にはrun IDとrun attemptを含め、同じ計算jobのuploadが返した正確なartifact IDだけを後続jobへ渡す。

保存jobは正常終了した本番計算だけに続き、共有writerキューと `contents: write` を持つ。checkoutは `scripts` と `data/stats` のsparse checkoutとし、downloadしたartifactを計算jobの入力SHAと照合する。profile、内容のSHA256、元blob、入力SHA、生成コードと対象workflowの変更を検査してから、許可したレポートと保存器自身が生成する `data/stats/audit-checkpoints/<profile>.json` だけを保存する。receiptには入力SHA、反映直前SHA、反映ファイルhash、生成・反映時刻を残す。artifactがreceiptを上書きすることはできない。入力SHAと反映直前mainのreceipt blobがartifactに記録した元receipt blobと両方一致することも必須とし、レポートが同じbytesのままでも、より新しい計算が保存済みなら古いartifactは拒否する。同じレポートや生成コードが進んでいたら古い成果物を混ぜずに失敗させ、現在のmainで再生成する。計算中に追加された予想・結果・note原稿を巻き戻さない。

PRは従来どおり検査だけを行い、本番データ生成・artifact公開・mainへの保存を行わない。既存triggerと `workflow_run` の成功条件を維持し、drop-stageの同一repository・main・非PR起動の追加条件も維持する。保存jobにbuilder・復元・prepare・旧 `git pull --rebase` 保存処理を置かない。対象外の監査workflowは従来の契約を維持する。

この分離は6本の重い監査が共有writerキューを占有する時間を減らす変更であり、すべての収集遅延が解消したという意味ではない。保存jobの待機、対象外writer、計算失敗・競合は引き続き個別に確認する。新しいcronやWork監視は追加しない。検証は `node scripts/test-result-report-checkpoint.cjs` と `node scripts/test-local-water-daily-input.cjs`、既存の各監査テストで行う。

## 外頭bottleneck監査の追加分離

`check-local-water-outer-head-bottleneck-audit.yml` も上記と同じ計算・保存分離を使う。profileは `local-water-outer-head-bottleneck-audit`、保存対象はその単一レポートと対応する `audit-checkpoints` receiptだけとする。計算の既存検査・原本復元・builder・prepareはread-only jobに保持し、保存jobには元blob・入力SHA・内容hash・コード変更・receipt世代の検査を備えた既存checkpoint保存器を使う。PRは検査だけで、既存triggerと成功条件は維持する。

変更前の2026-10-08実行 `37759931627` は共有writerを7分37秒占有し、保存stepは3秒だった。別の実行 `37747829008` のwriter終了08:30:14 UTCから4秒後に、08:13:05から待機していた公式結果collectが開始した。この修正の計算時間とwriter占有時間は区別し、本番反映後の実runでreport・receipt・source SHAと保存job時間を確認するまでは短縮実証済みとしない。

priority-score監査、予想ロジック、原本、cron構成は変更しない。GitHubの定期起動そのものが欠ける問題をこの分離で解消したとは扱わない。検証は上記checkpoint・daily-input検査に加え、`node scripts/test-local-water-outer-head-bottleneck-audit.js` を維持する。

## 監視

`result-collection-watchdog.yml` は結果収集の完了時と毎時47分に起動する。定時チェックも GitHub 内で完結する。

- 最新mainと最新のmain向け結果収集runを確認する。repository全体のrun APIを3時間ずつの作成日時窓で全ページ取得し、workflowパス・mainを照合して作成日時とrun IDで新しい順に選ぶ。期限対象の夜間開始まで遡り、1窓1,000件超・不完全ページ・完了イベントとの矛盾は読取失敗として止める。選択したrunを再取得し、遅れて届いた古い完了イベントだけで判定しない。既存の未起動回復も同じ取得方法で直近3時間の重複実行を防ぐ。
- 日本時間06:00を結果収集期限とし、期限を過ぎた直近2日分を検査する。06:00前は前日夜間分に猶予を与え、当日の未開催レースを不足扱いしない。
- 公式結果の日付・件数・明細・3連単払戻・重複・不成立・取得失敗を確認する。workflowのsuccessだけで正常復帰にしない。
- 期限までの未起動、長時間実行・待機、結果保存・校正・派生データ保存の各状態を区別する。
- 同じタイトルの既存監視Issueへ追記し、同じrun・状態を繰り返し通知しない。全条件の正常完了時だけ閉じる。
- 実行中の後続runやGitHub API読取失敗では、既存Issueを正常復帰として閉じない。API障害は監視workflow自体の失敗として残る。
- 失敗ジョブだけの再実行では、前の試行で成功済みの結果保存jobも確認する。

検証: `node scripts/test-result-collection-watchdog.js`。

## 公式取得と原本保存の分離

`verify` → `fetch_results` → `collect` の順に進める。`fetch_results` は
共有 writer キューを保持せず、公式取得器の既存の 3 並列と待機間隔、直近 3 日の
完成済み結果を含む訂正確認、既存の限定修復キューを維持する。対象日は取得開始時に
一度だけ JST で確定し、日跨ぎ後の照合にも同じ日付を渡す。取得 job の上限は 60 分、
照合・保存 job の上限は従来の 30 分であり、取得を保存待ち列の外へ移す。

専用の `result-source-checkpoint.cjs` は、日付を限定した公式結果だけを artifact に
格納する。予想、archive、note、原稿、派生レポートは含めない。GitHub の同じ run で
upload が返した正確な artifact ID を download に渡し、repository、run ID、取得
attempt、固定 source SHA、対象日、元 blob、内容 hash を検査する。失敗 job だけの
再実行では、成功済み取得 job の attempt 出力を引き継ぐ。取得 job の再実行を伴う
場合は新しい ID と attempt を使う。取得途中の失敗では artifact を公開せず、
限定修復キューの未完成は従来どおり失敗する。直近日の未確定・取得失敗行は既存取得器の
公式結果保持ルールのままであり、成功 run を全結果確定と読み替えない。

`collect` は共有 writer 内で最新 main を checkout する。コード、公式結果、前回
receipt が取得時から変わっていれば batch 全体を停止する。全検査に合格してから
公式結果だけを適用し、最新 main の予想 archive を復元する。`repair-recent-results.js
--sources-only --match-only` と既存の review・理論評価・外れ原因・v6 照合を実施する。
ここでは公式ネットワーク取得を再実行しない。予想や買い目を古い artifact から
戻さず、従来の結果照合情報だけを更新する。

保存時も毎回 fetch → 元 blob／コード／receipt 再検査 → 検査済み remote ref への
rebase → push の順に行う。検査後の `git pull` による再 fetch は行わず、push 競合は
最大 3 回とする。同じ結果の非競合行への更新も、JSON テキスト merge で受け入れない。
writer の checkout 時点の最新 main で照合する。push までの間に届いた予想や原稿の別ファイルへの追加は保持するが、その新着すべてを再照合したことは保証しない。同じ予想 archive の競合は停止する。
`data/stats/result-source-checkpoint.json` に取得 source SHA、run／attempt／artifact ID、
適用直前 SHA、日付と結果 hash を保存する。既存 report 専用 checkpoint の原本権限は
広げない。後続診断は従来どおり `collect.saved_sha` を読む。

回帰検査は `test-result-source-checkpoint.cjs`、`test-result-source-archive-order.js`、
`test-source-checkpoint-push-retry.cjs` と既存の結果収集・修復・report checkpoint 検査。
本番完了は自然 run の原本保存 commit、receipt と source、後続診断接続、writer
占有時間を読み戻して判定する。cron の起動欠落は別課題のまま扱う。
