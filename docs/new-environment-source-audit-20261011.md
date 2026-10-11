# 新環境情報の出典・入力・正式証拠監査 — 2026-10-11

基準main: `f5ebb6fddb624589d63cf725693f9b8883e9ae90`。
[理論棚卸し](theory-update-review-20261011.md) の次工程だった、多摩川・大村の出典→入力→期間判定→実効採点→正式証拠の監査を完了した。
保存済みレポートを使用し、全期間再計算・予想方式変更・過去原本補完は行っていない。

## 結論

- 正式新エンジン評価0件を、収集器の未実装や単なる100R待ちと説明しない。既存reportには3,110件のsupportと生成時診断があり、全件にモードoffが記録されている。
- 多摩川は固定設定の導入日が空欄。現モーターの使用開始日は公式資料と既存参考collectorに保存済みだが、予想の導入日入力へは未接続。
- 大村の固定設定は2025-05-24で、現在の公式資料が示す使用開始2026-05-24とは年が違う。固定値の「新型エンジン導入」と公式の現モーター使用開始を同じ事実として更新しない。
- 調査用入力に現使用開始日を仮設定しても、2026-10-11は両場とも既存120日間の適用期間外。日付更新だけで現在のモードや精度が改善する根拠はない。
- 日付・説明・正式タグを合格させるために採点を有効化せず、過去予想へ最新日付を後付けしない。

## 公式資料と保存材料

2026-10-11に公式本文を直接確認。検索結果の日付やstage用hostを正本にせず、下記本番URLを使用した。確認できたのは現モーターの使用開始であり、機種変更・新燃料導入はこの資料から確定しない。

| 対象 | 公式URL | 確認範囲 | 取得本文SHA256 |
|---|---|---|---|
| 多摩川 | https://www.boatrace-tamagawa.com/modules/datafile/ | 使用開始2026-04-18、集計2026-10-09 | `b18eb232da5222c6bd84e086c4fcbf028319b5919aeec081e40ccc2f8ae57a19` |
| 大村・成績表 | https://omurakyotei.jp/data/motor.php | 2026-05-24からの通算、集計2026-10-10以前 | `94548c1eca6698f56b635a053a6700b8cfe5fc1f1a0396dd4f366b11ed4b548f` |
| 大村・短評 | https://omurakyotei.jp/data/motor_review.php | 使用開始2026-05-24、掲載時点2026-10-09 | `afcf5fd885df59447b017758e3bc57c2a3d1f857573190a117a6890f8218fec3` |

多摩川は既存 `official-reference-v1.json.sources.motor-05` に65行、status=ok、sourceDate=2026-10-09。
snapshot `data/official-reference/motor-05/c4cf5a09a3192f2a0747ed7818a87f0f4a67b5c9f4c679d65e4242f4682567d8.json` の `data.useStartedAt=2026-04-18` と上記本文SHAが一致する。初回取得2026-10-10T21:51:24.117083Z。今回の確認を新しい締切前収集実績と呼ばない。

現collectorの27ソースには大村の場別成績stadium-24はあるが、使用開始日を保持するmotor-24はない。場別成績取得をモーター導入情報取得へ広げない。新しい収集器やcronは追加しない。

## 現行入力の接続

1. `api/race.js` は中央公式の出走表・直前情報と既存の独自展示/公式コース別ST順位を取得する。`api/_parser.js` のraceInfoはtitle・deadlineText・rawTextを保持。この経路にofficial-referenceの使用開始日を読む処理はない。
2. `scripts/collect-predictions.js` は既存履歴を付け、theory-input.prepareとcreatePredictionへ渡す。`js/prediction.js.normalizeRaceData` が場コードから場名を補う。今回のコア監査も正規のstadiumNameを使用した。
3. `js/ai-core.js.getNewEnvironmentPeriod` はトップレベルまたはraceInfoのnewEnvironment、明示フラグ/日付alias、場別固定設定、対象memo文字列を使用する。raceInfo.rawTextや参考資料のdata.useStartedAtを導入日へ変換しない。
4. 明示enabledがあれば優先。日付はintroducedAt→updateDate→日付alias→固定設定。導入日不明はunknown/provisional、導入前はscheduled、0〜45日early、46〜120日middle、121日以降stable。不明をactiveへ補わない。
5. `prediction-motor-engine-support` は評価済みaiCore.newEnvironmentTheoryの真偽値を優先し、説明のキーワードで覆さない。正式証拠は `theory-tag-snapshot.newEngineEvidence` が判定する。

## 期間と正式欠測理由

当日の現行コア関数を直接呼んで確認。下2行は入力の日付だけの仮設定で、設定ファイル・保存予想には適用していない。

| 入力 | 導入日 | 経過日 | phase | active | 意味 |
|---|---|---:|---|---|---|
| 現行・大村 | 2025-05-24 | 505 | stable | false | 固定日付では期間外、現在の公式使用開始と不一致 |
| 現行・多摩川 | 空欄 | 算出不可 | unknown | false | 日付未確認、provisional=true |
| 多摩川・現使用開始を仮設定 | 2026-04-18 | 176 | stable | false | 日付だけ入れても当日は期間外 |
| 大村・現使用開始を仮設定 | 2026-05-24 | 140 | stable | false | 日付だけ入れても当日は期間外 |

`data/stats/theory-performance-report.json` は2026-10-11T11:11:58.569Z生成、締切前予想と公式結果の結合3,590R。
sampleCount=43,080は理論別の延べ行で、レース数ではない。new-engineの正式評価は0、的中率はnullで、0%としない。

zeroEvidenceDiagnosticsのnew-engine行:

| 保存診断 | 件数 |
|---|---:|
| supportと生成時診断あり | 3,110 |
| 正式証拠あり | 0 |
| new-engine-mode-off | 3,110 |
| explicit-new-engine-statement-missing | 3,110 |
| ai-core-new-engine-mode-not-applied | 1,692 |
| effective-score-contract-missing | 1,692 |
| new-engine-weight-profile-mismatch | 1,418 |

理由は重複するため合算しない。残る480Rをこれらへ推定配分しない。
正式化にはsupportのモード、実際のcanonical採点、6艇の採点確認、中心艇、説明、実効係数契約がすべて必要。参考資料の追加だけでformalにはならない。
集計が示す直接理由はモードoffであり、多摩川・大村の設定だけで全3,110件の原因を説明したものではない。

## 完了範囲と残る条件

出典・入力・期間・正式欠測理由の監査は完了。同じ0件からcollectorやタグ生成器を作り直さない。
情報を予想へ接続する場合、使用開始/機種変更/燃料変更の区別、公式URL・本文SHA・取得時刻・適用場を固定し、既存snapshotを取得後の新規入力にだけ使う。大村の固定値を通常交換日で上書きする前に、既存engineの対象範囲との整合を確定する。
未確認・不一致・期間外を区別し、現在の2場をactiveにする45/120日閾値変更はしない。対象期間内の新規証拠、実効採点、締切前保存、同条件比較まで性能改善は未判定。正式100R・独立相手研究・参考資料の行数は別母数。

既存 `test-new-environment-theory.js` と `test-theory-zero-evidence-diagnostics.js` は成功。今回の差分は監査文書のみ。予想コード・設定・日次原本・採用gateに変更はない。
