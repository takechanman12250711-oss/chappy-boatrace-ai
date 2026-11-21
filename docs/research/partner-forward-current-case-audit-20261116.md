# 現方式のpartner-forward：保護7件と喪失3件の原本追跡

入力はPR1484のhead `67d31bada68f30c8bcda8cb6a5e3b1499fe30b40`。
レポート `data/stats/partner-forward-report.json` のblobは `6e72bacac13520d4b379bcb01dfdd08adda19d97`（生成2026-11-16 01:28:57 UTC）。
現note指紋 `b36ecb0212d212af85ce977322a0a799774265c4bc6152ef82d4d1123c7586b5` の最初の100枠だけを対象とする。確定94、返還等6、pending0。旧方式313枠を含めない。

ミナトがレポート10件と代表3原本を読み取り、原本本文のSHA256・締切前保存・baseline・保存選定証拠を照合した。主担当は下記の研究選定器と本番v1.3の保護コードを確認した。予想の再生成、原本変更、同期間での閾値調整、採用変更は行っていない。

## 対象の10件

indexはレポート `rows` の0始まり。各行の `snapshot.sourcePath/sourceSha256` が元原稿を指す。
表内だけ `123=1-2-3` と略記する。除外/追加は保存済み研究BのAとの差であり、本番v1.3の実施内容ではない。

| index | レースID | Bで除外 → 追加 | D |
| ---: | --- | --- | --- |
| 3 | 20261028-13-6 | 123・143・134・124・125 → 145・142・132・146・136 | 1-2組消失、全体をAへ |
| 11 | 20261028-22-12 | 123・124・134 → 146・125・145 | 1-3組消失、全体をAへ |
| 13 | 20261028-15-10 | 123・124・125 → 142・146・136 | 1-2組消失、全体をAへ |
| 51 | 20261030-18-7 | 123・124・134 → 146・125・145 | 1-3組消失、全体をAへ |
| 57 | 20261030-24-1 | 123・124・125 → 145・135・142 | 1-2組消失、全体をAへ |
| 64 | 20261030-24-12 | 123・124・125 → 145・146・136 | 1-2組消失、全体をAへ |
| 90 | 20261031-07-11 | 123・124・125 → 146・136・145 | 1-2組消失、全体をAへ |
| 78 | 20261031-04-6 | 123・124 → 126・146 | 組消失なし、D=B |
| 92 | 20261101-18-3 | 123・124 → 125・145 | 組消失なし、D=B |
| 97 | 20261101-06-2 | 123・124 → 145・126 | 組消失なし、D=B |

最初の7件は `comparisons.guardedVsPriority.gained`、最後の3件は `comparisons.guardedVsSaved.lost`。
結果は事後照合情報で、候補選定入力ではない。Dが守った組自体で当たったとは限らない。rows[3]は1-2組を消すBを拒否してA全体へ戻したため、Aにあった1-4-3も残った例である。

## 代表3原本

- **rows[3]：20261028-13-6**  
  sourceSHA `b3dea3319829224a8318cc23cd9e57383c1b512dacf948c03844478f38afd680`、blob `6931e5052d50c3bda30c24aa6178747ccc7f2408`。元パスは `data/note-drafts/20261028/20261028-13-6-b3dea3319829224a8318cc23cd9e57383c1b512dacf948c03844478f38afd680.json`。保存理由には、本番v1.3が1-2-6から1-3-5へ1対1置換し、本線・流し等を維持した記録がある。Aは6券。研究Bは別の処理で本線・流しも除去している。事後結果1-4-3を理由へ後付けしない。
- **rows[78]：20261031-04-6**  
  sourceSHA `0dd44c76c075b8765244816b517880a34549550297266da2b7fb03d31aa47afd`、blob `7be18ed8eaffaeda7b18d2cdbccbb3f1e2eafebb`。元パスは `data/note-drafts/20261031/20261031-04-6-0dd44c76c075b8765244816b517880a34549550297266da2b7fb03d31aa47afd.json`。保存証拠 `record.practicalSelectionEvidence.candidateDecisions[5/6]` は123/124をALREADY_SELECTED、priority97/88として保持。`[8/16]` の126/146はpriority100のCANDIDATE_ONLY_EVALUATION。126の物理根拠は1・3着だけ。研究Bが上位点を選んでも1-2組は残るのでDは戻さない。事後結果123。
- **rows[97]：20261101-06-2**  
  sourceSHA `ccb2f955fcbdbe60b8f700c2d27dcbc04ab3f9a42eac435c22c1af002ecd87cd`、blob `cbb807335ee29e349d2415c3c235388fe7f8ba4c`。元パスは `data/note-drafts/20261101/20261101-06-2-ccb2f955fcbdbe60b8f700c2d27dcbc04ab3f9a42eac435c22c1af002ecd87cd.json`。同証拠の `[3/4]` は123/124が採用済み、priority78/81。`[6/13]` の126/145は元候補、priority82/100。145の物理根拠は1・3着だけ。Aには125もあり、Bで123/124を失っても1-2組は残る。事後結果124。

保存理由を確認した原本は上記3件。残り7原本の本文は未取得。研究snapshot自体はA/B/Dの券と原本参照を保持し、順位理由やpairGuardAppliedの値は保存していない。段階別selectedフラグと最終採否を混同せず、最終集合はsnapshot/baselineを正本とする。

## 研究Dと本番v1.3を分ける

- 研究B（`scripts/research-escape-partners.cjs:56`）は保存priorityと「1着＋他の1位置以上」の根拠で順位を作る。本番と同じ全3位置・同一成立枝の検証ではない。
- 研究D（同:76）は、Bが保存1・2着組を一つでも消すと選択全体をAへ戻す。3着単位の保護ではない。
- 本番v1.3（`js/practical-selection.js:2401`）は123/124を保護し、本線・流しも除去対象から外す。候補には全3位置の根拠と同一scenario/sourceを要求し、1対1だけ置換する。

Dの3件の喪失を「本番v1.3の保護漏れ」と呼べない。研究B/Dをそのまま本番へ移すと、既存の保護を失うおそれがある。

Aは32的中・回収率99.369%、Bは28・89.190%、Dは34・100.036%。D対Aの差は同投資84,000円で払戻+560円。gate未登録・INSUFFICIENT_EVIDENCE・自動適用なしを維持する。

次の最小検証は、`build-race-review-progress.js` の `selectionEvidence()` と `actualSelectionDiagnostic()` で関係券の位置・priority・枝ID・最終集合を並べること。現指紋のcandidate24内・選定外156件へ広げる場合も、全保存プールと本番と同じ成立枝・保護条件を先に照合する。priorityだけの改善、的中3件の事後保護、採用基準を作らない。

## 既存ヘルパーによる15候補の構造化照合

ミナトが上記3原本から15候補を絞り、既存 `selectionEvidence()` と `actualSelectionDiagnostic()` を実行した。ヘルパーblobは `6d7fe819bbe731b1e7b5248a6468037f8d09d666`、SHA256 `71627f567838e6b14f0335a8ad600445af207d1eea72ce33eb14a2e19410aedb`。同一性・配列件数・index・券・判定項目を維持し、不要項目を省いた46,327 byteの投影を使った。全履歴をそのまま再実行したとは扱わない。3原本とも保存証拠statusはvalidatedで、snapshot A・原本baseline・証拠内の券集合が一致した。

| 原本 | 関係券（3桁略記） | 保存physical位置 | 同scenario/source内のqualified全3位置 |
| --- | --- | --- | --- |
| 20261028-13-6 | 123/124/126/135/145/143 | 各1・2・3 | 保存あり（context/trim等の再構成による購入適格判定ではない） |
| 20261031-04-6 | 123/124/126 | 1・3 | unknown |
| 同 | 146 | 1・2・3 | unknown |
| 20261101-06-2 | 123/124/125/126 | 1・2・3 | unknown |
| 同 | 145 | 1・3 | unknown |

前者の123/124/135/145/143はobservations[0/1/6/10/9]、canonical:1/base-formation:main、126はobservations[3]、canonical:1/base-formation:flowに保存根拠がある。実置換126→135はcandidateDecisions[3/12/129]と[15/130]のreasonCodeでも確認できた。残る2原本ではphysicalCoverageに1着があっても、保存された同qualified枝群の全3位置は確認できずunknownとした。異なる観測やsourceの根拠は合成しない。

事後actualSelectionDiagnosticは143/123/124について、いずれもactualFinalDisposition=selected・actualInCandidatePool=true。これはAの的中と保存段階記録の照合であり、候補の役割判断が正しかったという証明ではない。結果を選定や根拠の再生成に使っていない。
