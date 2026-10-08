# 結果収集と監視

公式結果収集・校正・異常通知は GitHub Actions で実行する。Work/ChatGPT の常時ポーリングを再作成しない。

## 中央の保存順

`collect-results.yml` 自体は `chappy-result-pipeline` で世代を直列化する。このworkflow内では、共有 `chappy-main-data-writers` は公式原本の収集保存と2つの成果物保存jobだけが保持する。重い診断・校正・事前検査は contents: read で実行し、予想収集の待機列を占有しない。既存scheduleを維持し、新しい定期writerやWork監視は追加しない。

1. `verify` は既存の回帰検査を行う。
2. `collect` は最新mainを取得し、`repair-recent-results.js --sources-only` で公式結果を収集・照合する。原本に付くreview・理論評価・外れ原因・展開AI v6照合を更新し、indexを再生成して、公式結果と圧縮予想原本を先行checkpointする。v6照合は同じ対象日から直近3日を扱い、夜間に日付が変わっても前日分を保存する。照合は結果後の検証情報だけを追加し、保存予想・買い目・自動採用は変更しない。診断側で照合後に古いarchiveを復元して情報を失う順序に戻さない。この短いjobは共有writerキューを保持する。
3. `diagnostics` は `collect.saved_sha` を復元し、既存の重い分析・参考統計・整合性検査を行う。検査済みのstatsと参照タグ成果物だけを元blob・SHA256・入力SHA付きartifactへ渡す。予想/結果原本に未保存変更があれば停止する。
4. `publish_reports` はそのartifact IDだけを取得し、共有writerキュー内で最新mainと照合する。許可したレポートの元blobが同じ場合だけ反映する。計算中に増えた予想・結果・note原稿は触らない。生成コードが変わった場合、または同じ診断成果物が変わった場合はbatch全体を失敗させ、古いJSONを自動mergeしない。独立したpractical-priority-shadow-reportだけは予想収集側の新しい版を保持して記録する。
5. `calibrate` は `publish_reports.saved_sha` を復元し、既存の校正と整合性検査を行う。`publish_calibration` が同じ照合方法で短時間保存する。既存builderが作る `data/predictions/calibration.json` と `data/predictions/improvement-review.json` は派生レポートとして校正stageだけに明示登録する。diagnostics stageや他の予想ディレクトリ内ファイルには許可を広げない。元blob・入力SHA・内容hash・コード競合の検査は同じで、sparse checkout外でも検査済みの正確な2パスだけをstageできるようにする。日次予想・公式結果・source archiveは引き続き保存対象外であり、未保存変更があれば停止する。

共有キュー外の計算は保存済みSHA時点の分析であり、計算中に追加された最新予想まで含むとは扱わない。`data/stats/result-diagnostics-checkpoint.json` と `result-calibration-checkpoint.json` に入力SHA、反映直前SHA、反映ファイルhash、新しい版を保持した対象を記録する。許可範囲外の原本や記事をartifact経由で保存しない。

派生レポートのpushが他の変更に先を越された場合は最新mainとの照合だけを最大3回繰り返す。予想と公式原本の先行保存も、commit済みの差分を保ったまま `pull --rebase --autostash` とpushを最大3回行う。同じファイルのrebase競合は自動解決せず停止する。強制pushや共有キュー内での重い再計算は行わない。競合・生成失敗・artifact不足を成功に置き換えない。先行保存済みの公式結果は残り、GitHubの失敗job再実行、または次の既存定期実行で再開する。コードや同じレポートが変わった競合は現在のmainからの再生成が必要。

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
