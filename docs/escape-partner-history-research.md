# 逃げた場合の相手選びを検証する

ボートレース日和の「逃がし2着率」のように、逃げが成立した条件下で相手を見る考え方を参考にする。ただし外部サイトの数値を取得・転載せず、既存の公式結果から場別の2着・3着コースと組合せを数える。外部サイトと同じ指標・精度だとは主張しない。

## 比較対象

- A: 不変note原本に保存された実戦厳選。
- B: 保存済みの展開根拠とpriorityScoreで、実際の1コース艇が頭の相手枠だけを再選定。
- C: Bと同じ選定で、priorityScoreが同じ場合だけ当地の「逃げたときの2・3着コース組合せ頻度」を使う。

頭の配分・点数を維持し、独立展開として採用された券とスコアのない券は固定する。保存された候補24点内にあり、枝IDと艇・着順が一致するheadおよび相手の物理的根拠がある券だけを使う。途中段階のselectedフラグを最終採否へ読み替えない。相手の固定選定を解いたBの効果と、場別履歴を加えたCの効果を分けて集計する。オッズは選定に使わない。

## 原本・履歴の契約

既存 `build-race-review-progress.assess` を通る通常原稿に限定し、ファイル名のSHA256を確認する。同じRは最新の有効な締切前原本を使用し、同時刻はSHA順で固定する。実進入6艇が不明なら除外する。`practicalSelectionEvidence` は既存のidentity・method・baseline検証が通るものだけを使い、記録がない過去原稿へ後付けしない。独立監視のイン逃げ・万舟原稿は対象外。

履歴は `data/results/YYYYMMDD.json` の公式逃げ、実際の1コース艇の勝利、6艇の着順・進入、返還なしを確認する。評価Rの前日までに行われたレースだけを使い、同日・未来結果は入れない。開催場ごと30件以上という既存の場別履歴信頼度の下限を使い、下限未満ではCはBと同じにする。履歴ファイルSHAと各Rの履歴集計SHAを記録する。

**これは過去データによる発見用比較。** 過去の公式結果を今集計しているため、当時のアプリへの入力保存を証明するものではない。`asOfAvailabilityProven=false`。結果未閲覧の正式holdout・将来保存・本番採用の成績にはしない。外部数値の新規接続も行わない。

## 実行と判断

既存 `escape-main-audit.yml` の日次分析に接続する。PRでは読み取り・artifact保存まで、mainと既存手動／日次実行では派生レポート `data/stats/escape-partner-history-research.json` を保存する。原本・公式結果・予想コードは書き換えない。

同じR・同じ点数・各券100円という比較用会計で、A/B/Cの的中率・回収率・追加的中・失った的中・純増を出す。全体、24場、保存方式別、履歴によってBから変わった対象を分ける。返還・払戻不明は除外、未確定はpending、0件の率はnull。

採用gate未登録なので `INSUFFICIENT_EVIDENCE` を維持する。Bに比べてCが変わらない場合や失った的中が上回る場合もそのまま報告し、良い結果を得るための重み調整を同じ評価期間で繰り返さない。`productionChanged=false` / `automaticProductionChange=false` / `usableForPrediction=false`。

確認: `node --test scripts/test-escape-partner-history.cjs`。実データ比較: `node scripts/research-escape-partners.cjs`（GitHub Actionsで実行）。
