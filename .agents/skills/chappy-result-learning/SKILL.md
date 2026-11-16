---
name: chappy-result-learning
description: 予想結果の振り返り、外れ分析、改善案の採否、的中率・回収率改善の検証に使う。悪化した案を全部捨てず、良かった要素だけを切り出して次の比較へつなげる。
---

# 結果分析と改善

## 基本手順
1. 締切前に保存された予想原本を固定する。
2. 公式結果と照合する。
3. 展開、軸、2着役割、3着役割、買い目不足を分けて原因を特定する。
4. 改善案は「全部採用/全部破棄」ではなく、良化した要素だけ抽出する。
5. 同条件比較 → 新しいレースで再検証 → 改善が確認できた要素だけ本番採用候補にする。

## 禁止
- 結果に合わせて過去予想を書き換えない。
- 少数レースだけで重みを急変させない。
- 100R蓄積そのものを目的にしない。検証目的に必要な最小単位で進める。
- 的中率だけを上げて回収率を無視しない。

## 蓄積軸
場、気象、水面、コース、選手、攻め筋、ST、展示、着役割ごとに分け、再現性のあるパターンだけ次の予想改善へ使う。

## 定型買い目との比較

- 保存済み監査を使う比較は `scripts/build-fixed-head-baseline.cjs INPUT OUTPUT` を再利用する。入力は `escape-main-audit-v1`、出力は原本とは別の作業用ファイルにする。
- 1号艇頭・相手数字順という固定ベンチマークと、同じレース・各レース同じ点数・1点100円で比較する。的中率・回収率・追加的中・消失的中・期間別・方式識別子別を一緒に読む。
- 長期公式結果の件数を締切前予想の検証件数へ足さない。元監査のSHAと生成時刻を固定し、方式混在の累計を最新方式の成績と呼ばない。
- これは過去の診断であり、新候補の未使用holdoutや本番採用条件の代替ではない。固定ベンチマークを結果に合わせて最適化しない。

- `escape-main-audit.pool` は `candidate24Tickets` のみで、全保存候補の和集合ではない。pool不明を別にし、pool外の選定券や的中も確認してから生成不足と選定不足を分ける。正式なmain/cover/flow/manshuと独立枝の不足は元bundleで確認する。
- 同じ方式の比較には `race-review-evidence.js` の保存指紋と対象期間を固定する。指紋にはnote-generatorと相対require依存も含まれ、sourceCommit数を方式数と扱わない。リポジトリ内の依存名はOSに関係なくPOSIXで解決し、Windowsだけの誤った指紋を新方式へ読み替えない。

- 「正式な主展開の頭」と「保存厳選に含まれる頭」を別に集計する。固定比較CLIのselectedHeadCoverage/selectedHeadAllocationとbyGenerationAndSourceを使い、配分の投資・払戻・的中が元の合計と一致することを確認する。頭別の異なる投資配分は記述統計であり、同予算代替や未使用期間の改善実証としない。

## 候補補完の役割別priorityを読む診断

- 新しい保存では `practicalSelectionEvidence.promotionRolePriorityDiagnostic` を読む。正本は `scripts/promotion-role-priority-diagnostic.cjs` と既存capture。KEEP_A・別選定なしの診断であり、boundは単一保存観測との値の一致を指す。昇格時刻・消費観測ID・予想改善の証明とはしない。
- 最終A/selection/validationの原順と、同じ観測・scenario/source/kind・各位置の役割枝を照合する。曖昧・欠測・矛盾・救済前snapshotはunknown。未保存のphysical score/branchIdや古いpromotion行を後付けしない。branch.priorityScoreを確率やrole.scoreへ読み替えない。
- diagnosticCodeSha256は診断/captureコードの識別子で、予想methodとは別。診断の失敗は既存Aを失敗へ変えない。実レースで読める割合や比較条件を先に確認し、新順位・閾値・自動採用・100R再収集へ直結させない。


## 候補補完の実行時キュー観測

- 新しい不変note/source原本では `practicalSelectionEvidence.candidatePromotionExecutionEvidence` を読む。正本は `scripts/candidate-promotion-execution-evidence.cjs` とselector内の実行時観測。補完直前のselected/used/残枠、実queue原順と元candidate位置、消費validationの完成配列参照、実処置、後段変換への参照を保存する。既存役割/coverageを複製・再資格判定せず、候補を再生成しない。
- 満枠判定はコース判定より先なので、未実行courseを補わない。実mapping/formal/lookup/艇番fallbackを区別する。後段trim/置換は既存meta・decisionとの照合、wrapper救済は既存の厳密mismatchDiagnosticが認定した前後対応だけを使う。観測欠測・参照不一致・診断失敗はunknown/KEEP_Aで、元A保存を止めない。
- これは新順位や比較候補を作る機能ではなく、rankingProposed/usableForPrediction/automaticApplicationはfalse、alternativeTicketsはnull。旧原本へ後付けしない。日次compactやreview縮約行は新queueを保持しないため、将来比較にはSHA固定の不変原本を参照する。
- selectorの観測metadata追加でも予想コード指紋が変わる。旧b36群や完了済み100枠へ混ぜず、将来の比較規則・期間・同点/未知処理・封印/結果結合を別に固定する。旧partner-forward B/Dのprotocolへ新queue比較を流し込まない。


## 頭役割priorityの前向きB1比較

- 正本は `config/promotion-head-priority-forward-v1.json` と `docs/research/promotion-head-priority-forward-v1.md`。純粋比較器は実validationRefで保存役割値を読み、現queueのA原順再現後にBだけ頭枝priority降順・同点queueIndexへ並べる。元90ゲート・前選定・点数・購入コース条件は保持する。役割/候補の再生成や再資格判定をしない。
- 純粋比較器のsourceReferenceVerified=falseと、外側の実原本byte照合sourceBytesVerified=trueを区別する。曖昧/欠測/不一致は有効Aを保持してB=A、後段変換は非適用、不正Aはineligible。封印した有効Aのunknown/非適用も母数に含め、非封印・全開催coverageの未集約を0件にしない。
- 期間開始前のremote登録を必要とし、締切前に全snapshotのcanonical manifest SHAをartifact名へcommitする。seal/reportで全manifestと個別membership・id/digest/run/head/時刻を照合する。これは遠隔hash commitmentで、ZIP実体の包含検査と混同しない。登録欠測時に期間を自動延長しない。
- 既存live-noteの公開引き継ぎ後にcapture/seal/saveし、新研究の失敗で既存の証拠保存をskipさせない。reportは期間終了後だけ公式結果を結合し、同点数・1点100円の仮想成績、追加/消失的中・払戻差・未知/返還/結果待ちを区別する。adoptionGate=null/予想利用・自動適用falseを維持し、旧100枠や本番会計へ混ぜない。
