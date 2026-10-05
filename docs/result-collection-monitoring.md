# 結果収集と監視

公式結果収集・校正・異常通知は GitHub Actions で実行する。Work/ChatGPT の常時ポーリングを再作成しない。

## 中央の保存順

`collect-results.yml` 自体は `chappy-result-pipeline` で世代を直列化する。共有 `chappy-main-data-writers` は公式原本の収集保存と2つの成果物保存jobだけが保持する。重い診断・校正・事前検査は contents: read で実行し、予想収集の待機列を占有しない。既存scheduleを維持し、新しい定期writerやWork監視は追加しない。

1. `verify` は既存の回帰検査を行う。
2. `collect` は最新mainを取得し、`repair-recent-results.js --sources-only` で公式結果を収集・照合する。原本に付くreview・理論評価・外れ原因を更新し、indexを再生成して、公式結果と圧縮予想原本を先行checkpointする。この短いjobは共有writerキューを保持する。
3. `diagnostics` は `collect.saved_sha` を復元し、既存の重い分析・参考統計・整合性検査を行う。検査済みのstatsと参照タグ成果物だけを元blob・SHA256・入力SHA付きartifactへ渡す。予想/結果原本に未保存変更があれば停止する。
4. `publish_reports` はそのartifact IDだけを取得し、共有writerキュー内で最新mainと照合する。許可したレポートの元blobが同じ場合だけ反映する。計算中に増えた予想・結果・note原稿は触らない。生成コードが変わった場合、または同じ診断成果物が変わった場合はbatch全体を失敗させ、古いJSONを自動mergeしない。独立したpractical-priority-shadow-reportだけは予想収集側の新しい版を保持して記録する。
5. `calibrate` は `publish_reports.saved_sha` を復元し、既存の校正と整合性検査を行う。`publish_calibration` が同じ照合方法で短時間保存する。

共有キュー外の計算は保存済みSHA時点の分析であり、計算中に追加された最新予想まで含むとは扱わない。`data/stats/result-diagnostics-checkpoint.json` と `result-calibration-checkpoint.json` に入力SHA、反映直前SHA、反映ファイルhash、新しい版を保持した対象を記録する。許可範囲外の原本や記事をartifact経由で保存しない。

派生レポートのpushが他の変更に先を越された場合は最新mainとの照合だけを最大3回繰り返す。予想と公式原本の先行保存も、commit済みの差分を保ったまま `pull --rebase --autostash` とpushを最大3回行う。同じファイルのrebase競合は自動解決せず停止する。強制pushや共有キュー内での重い再計算は行わない。競合・生成失敗・artifact不足を成功に置き換えない。先行保存済みの公式結果は残り、GitHubの失敗job再実行、または次の既存定期実行で再開する。コードや同じレポートが変わった競合は現在のmainからの再生成が必要。

予想収集も `predict` の保存までだけ共有writerキューを保持し、その後の非必須回帰検査は保存済みSHAを読む `regression` jobへ分離する。予想基準・買い目・自動採用条件・noteの締切条件は変更しない。

検証: `node scripts/test-result-report-checkpoint.cjs`（競合、更新された原本の保持、改ざんartifact、push中の更新、job境界）。GitHub concurrencyのjob単位制御とartifact IDは公式機能を使用する。

## 監視

`result-collection-watchdog.yml` は結果収集の完了時と毎時45分に起動する。定時チェックも GitHub 内で完結する。

- 最新mainと最新のmain向け結果収集runを確認する。遅れて届いた古い完了イベントだけで判定しない。
- 日本時間06:00を結果収集期限とし、期限を過ぎた直近2日分を検査する。06:00前は前日夜間分に猶予を与え、当日の未開催レースを不足扱いしない。
- 公式結果の日付・件数・明細・3連単払戻・重複・不成立・取得失敗を確認する。workflowのsuccessだけで正常復帰にしない。
- 期限までの未起動、長時間実行・待機、結果保存・校正・派生データ保存の各状態を区別する。
- 同じタイトルの既存監視Issueへ追記し、同じrun・状態を繰り返し通知しない。全条件の正常完了時だけ閉じる。
- 実行中の後続runやGitHub API読取失敗では、既存Issueを正常復帰として閉じない。API障害は監視workflow自体の失敗として残る。
- 失敗ジョブだけの再実行では、前の試行で成功済みの結果保存jobも確認する。

検証: `node scripts/test-result-collection-watchdog.js`。
