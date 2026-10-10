# 理論アップデート棚卸し — 2026-10-11

## 結論と今回の範囲

基準main: `269d4783067e2d89f9d79fab047545f2d22c9d7e`。最新版の実装・保存済み検証・関連PRコメントを照合した。予想ロジック、重み、買い目、過去原本、採用gateは変更していない。

- 登録13理論のbuilderは13/13存在し、既存inventoryを実行して確認した。これは実装の存在確認であり、全理論の本番効果を実証したという意味ではない。
- phase7の候補状態は、承認・実装済み1（壁）、棄却4、比較条件未定義等8。棄却は個別改善案に対する判定であり、理論全体の廃止ではない。
- phase8の「検証可能1」は採用済みの壁艇案。同じ1件を新たな採用候補として数えない。残りは棄却済み重複4、効果を単独に分離できない4、候補未定義4。
- 既存の2・3着ペア研究はPR #1283で診断・保存・日次集計接続済み。新規実レースの締切前sealと、そのデータを含む集計は未確認。実装を作り直さない。

## 理論別の実装・検証・更新判断

以下の「候補」は過去の固定案を指す。正式根拠件数は後述のcoverage時点・定義に限る。

| 理論ID／対象 | 実装・接続の入口 | 既存候補の判定 | 不足・今回の更新判断 |
| --- | --- | --- | --- |
| flow／逃げ・展開 | ai-core: buildFlowTheory、buildRaceScenarios | 単独flow信号は棄却（#692） | 逃げを一律昇格せず、主展開と相手不足を分離。旧ST・攻め・展示複合案も終了済み |
| attack／差し・まくり等 | ai-core: buildAttackTheory | #690固定案は784適格・413再現可能で発火せず棄却（#981） | 外攻め全体の別研究と混ぜず、同じ固定案を再開しない |
| wall／壁艇 | ai-core: buildWallTheory、購入見送り方針 | 承認・実装済み | 193R、250R最終確認未到達。100R承認待ちへ戻さない |
| course／コース | ai-core: buildCourseStructureEvaluation | 枠別浮沈率の固定100案は棄却 | 公式実進入の既存接続を維持。9月362Rへの追加コース係数探索は終了 |
| stSlit／ST・スリット | ai-core: buildStFoundationEvaluation、prediction-st-exhibition-support | 単独比較案が未定義 | ST未使用とは言えない。上流採点と補助説明を分離し、説明の存在を券への効果に読み替えない |
| exhibition／展示・足 | ai-core: buildExhibitionPerformanceEvaluation | 単独比較案が未定義 | 展示9%枠、STとの分離、一周公式6艇契約を維持。展示順位別成績だけで重み変更しない |
| holdPickup／残し・拾い | ai-core: buildHoldPickupTheory | 同点数入替案は102Rで24→24、払戻減のため棄却（#863） | 個別艇評価とペア根拠の未接続は別課題。PR #1283の診断を再利用 |
| local／当地 | ai-core: buildLocalTheory | 複合A/Bから単独効果を分離不能 | 母数・期間・登録番号・実進入を伴う既存研究を使う。当地率だけで昇格しない |
| waterWeather／風・波・潮 | ai-core: buildWaterWeatherTheory | 複合A/Bから単独効果を分離不能 | 気象別履歴v1/v2は材料保存。条件一致数と適性順位・予想効果を分離 |
| racerSkill／技量 | ai-core: buildRacerSkillTheory、racer-skill-core-integration | 新しい単独案は未登録 | 同等の残し・拾い候補で固有技量を使う既存接続あり。級別・ST等を再加点しない |
| motorMaintenance／モーター・整備 | ai-core: buildMotorMaintenanceTheory、prediction-motor-engine-support | 新しい単独案は未登録 | 実効採点契約は既存。モーター率だけの順位変更や展示・STの二重加点をしない |
| raceTrend／レース傾向 | ai-core: buildRaceTrendEvaluation、collectorの呼出し | 単独案未登録 | phase7 coverageの専用キーなし。nullを0件や実装なしにしない |
| newEnvironment／新型・新燃料 | ai-core: buildNewEnvironmentTheory、getNewEnvironmentPeriod | 固定候補なし、正式根拠0 | 導入種別・導入日・適用期間と証拠化条件の確認を更新候補にする。タグ生成器の再実装は不要 |

共通実装は [ai-core.js](../js/ai-core.js)。登録正本は [theory-validation-inventory.cjs](../scripts/theory-validation-inventory.cjs)。判定正本は [phase7](../data/stats/theory-validation-phase7-lifecycle.json) と [phase8](../data/stats/theory-validation-phase8-cycle.json)。

## 母数と鮮度を混同しない

phase7 sourceGeneratedAt=2026-10-10T19:21:01.286Z、phase8 generatedAt=2026-10-10T19:21:01.407Z（10/11 04:21 JST）。
ただしphase8のsourceCoverageGeneratedAtは2026-10-10T15:00:06.045Z（10/11 00:00 JST）。04:21に全理論の入力を再収集したわけではない。

coverageは12タグ・対象3,548R。13builderとは分類が異なり、当地と水面は同じタグ、ダブルタイム等は別タグである。件数は重複するので足し合わせない。

| 正式根拠タグ | 評価件数 |
| --- | ---: |
| 展開／残し・拾い | 各3,121 |
| コース | 2,724 |
| ST・スリット | 515 |
| 展示・足 | 1,124 |
| 当地・水面 | 2,882 |
| 技量 | 2,333 |
| モーター | 2,042 |
| 壁艇 | 2,004 |
| 枠別浮沈率 | 1,719 |
| ダブルタイム | 10 |
| 新エンジン | 0 |

枝別reportは別の3,588R等を使い、定義も違う。例: 展示reportの正式根拠726R、ST reportの検証側正式採点734Rを、このcoverageの1,124／515へ足したり矛盾扱いしたりしない。これらは理論の因果効果や現行世代の的中率ではない。

wall/lifecycleを保存した [run38079153037](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/actions/runs/38079153037) はhead `963a81c1c08527b36d8aec68c063f57cd388fda4`。契約検査、原本復元・生成、保存の3step成功を確認。保存commitの短縮SHAは `c80a141a3`。その後の同名skipped runを保存失敗とは扱わない。
一方、pre-race theory context/outcomesのrun38079933300／38079957163はfailureであり、この棚卸しで成功・更新済みへ読み替えない。運用障害はdotの担当として維持し、原因調査・修正を今回実施したとは報告しない。

## 終了済みの比較 — 再開しない

- ST＋攻め役割＋展示の固定複合条件: 193R中該当7R、頭の正解94→95、片側p=0.5。2026-09-20保存reportはrejected、holdoutConsumed=true。これは3連単の的中数ではない。
- 残し・拾い7点同額案: 保留102Rは24→24的中、払戻29,420→28,010円。不採用。
- PR #1087の2・3着コース補正除去／2着だけ除去、PR #1277の3着保護は比較・不採用まで完了。今回再計算していない。
- Issue #1214最新コメント6098700177の「ペア診断未実装」は、後続PR #1282／#1283と#1283本文のmain後確認によって更新する。

## 新しく確認した情報更新候補

### 新環境の導入日と種別（調査候補、採用候補ではない）

現行 `NEW_ENVIRONMENT_UPDATE_DATA` は大村のengine導入日を20250524、多摩川はengine.enabled=true・introducedAt空欄として持つ。導入日不明はprovisional、日付がある場合は既存45日／120日の区分で判定する。formalタグはmode、実際の採点結果、6艇、説明、実効係数の一致まで要求するため、0件から「収集器が存在しない」とは断定できない。

[多摩川公式モーターデータ](https://www.boatrace-tamagawa.com/modules/datafile/) は確認時、集計時点2026-10-09、現モーター使用開始2026-04-18と表示した。しかしこれは現モーターの使用開始であり、新型機種・新燃料導入の証拠とは別。通常交換日を既存engine欄へ即代入しない。大村は検索結果だけで日付を確定せず、更新未実施とする。

この差は、日付を更新して精度が上がるという証拠ではない。履歴上の期間、通常交換／新型導入／燃料の区別、締切前に取得可能だった出典、保存入力の優先順位を先に確認する。過去原本へ最新日付を遡及適用しない。

### 優先順位と次の1工程

1. **研究主線は既存ペア診断の新規締切前seal確認を維持。** 実レース0件を改良成功とは扱わない。候補順位への接続は未実装で、同zone一律除外もしない。
2. その待ち時間に進められる情報更新の次の1工程は、**新環境情報の入力・出典監査**。公式の導入種別と日付 → 取得入力 → 既存期間判定 → 実効採点 → formal欠測理由を追跡する。今回確認した多摩川を起点とし、いきなり24場の新収集を追加しない。
3. 完了条件は「日付不明・適用期間外・通常交換と種別不一致・採点証拠不足」を区別して原因を示すこと。修正が必要ならwhat/why/impactを固定し、既存モード・閾値を勝手に変更しない。
4. 気象別の艇適性、新しいST／展示単独案は未定義の研究候補。今回採用登録や性能比較を開始したとは扱わない。13理論一括の重み変更は行わない。

## 今回の検証と変更範囲

実行した既存チェック:
- `node scripts/theory-validation-inventory.cjs`: 13builderの存在を確認。古いinventoryのmutator区分を最新候補の採否へ使わず、phase7/8を優先。
- `node scripts/test-collector-theory-support-wiring.js`: 成功。
- `node scripts/test-new-environment-theory.js`: 成功。
- `node scripts/test-theory-weight-evidence-contract.js`: 成功。

既存研究スキルに従い、実装・材料・比較・採用を分離した。新しい常時監視・cron・有料API・予想変更はない。手順変更はないため個人スキルの書き換えは不要。

## 証拠ファイルの固定

基準mainで読み取ったGit blob SHA。内容が後日更新された場合はこの時点の参照へ戻れる。

| ファイル | Git blob SHA |
| --- | --- |
| [js/ai-core.js](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/269d4783067e2d89f9d79fab047545f2d22c9d7e/js/ai-core.js) | `5d4795981ad81eba0659b52d5436a7f1dab8e6a2` |
| [data/stats/theory-validation-phase7-lifecycle.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/269d4783067e2d89f9d79fab047545f2d22c9d7e/data/stats/theory-validation-phase7-lifecycle.json) | `20e6af98d415475c5e9d3cab2e25f89623dc1cb8` |
| [data/stats/theory-validation-phase8-cycle.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/269d4783067e2d89f9d79fab047545f2d22c9d7e/data/stats/theory-validation-phase8-cycle.json) | `8767fe610a92683e98f178bb8a690683e5bd302b` |
| [data/stats/theory-evidence-coverage-phase7.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/269d4783067e2d89f9d79fab047545f2d22c9d7e/data/stats/theory-evidence-coverage-phase7.json) | `51f1f4f3f0cd43043e96d67cfffa554cb6f39cc6` |
| [data/stats/theory-evidence-growth-monitor.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/269d4783067e2d89f9d79fab047545f2d22c9d7e/data/stats/theory-evidence-growth-monitor.json) | `4733aacebed563e921538783fbbdfb223caa1f24` |
| [data/stats/st-slit-branch-profit-report.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/269d4783067e2d89f9d79fab047545f2d22c9d7e/data/stats/st-slit-branch-profit-report.json) | `39920091219cac6d5bff3b1e617e0ce65147e78a` |
| [data/stats/exhibition-foot-branch-report.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/269d4783067e2d89f9d79fab047545f2d22c9d7e/data/stats/exhibition-foot-branch-report.json) | `ba8537ccbb2d81bd8216612427adbcaad52b99f0` |
| [data/stats/local-water-branch-report.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/269d4783067e2d89f9d79fab047545f2d22c9d7e/data/stats/local-water-branch-report.json) | `6fbf1f23d3632b05413b9c3a0040dcb8aaaea76e` |
| [data/stats/skill-branch-report.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/269d4783067e2d89f9d79fab047545f2d22c9d7e/data/stats/skill-branch-report.json) | `032edbbd62a63fdc779f93335185dfac14c808fa` |
| [data/stats/motor-course-branch-report.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/269d4783067e2d89f9d79fab047545f2d22c9d7e/data/stats/motor-course-branch-report.json) | `abf24a82c2d87b4eb6ca1e0ac6428b5a81d35aec` |
| [data/stats/wall-established-attacker2-skip-ab-report.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/269d4783067e2d89f9d79fab047545f2d22c9d7e/data/stats/wall-established-attacker2-skip-ab-report.json) | `c093b9300536d314b64441e2aecab4fa05520d03` |
| [data/stats/remain-pickup-same-stake-shadow-report.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/269d4783067e2d89f9d79fab047545f2d22c9d7e/data/stats/remain-pickup-same-stake-shadow-report.json) | `393f214909bcb5ad1916385ab4109feffe5b2573` |
| [data/stats/st-role-attack-exhibition-holdout-report.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/269d4783067e2d89f9d79fab047545f2d22c9d7e/data/stats/st-role-attack-exhibition-holdout-report.json) | `cf4c61b5f6d98189ddc834b9a22d5ab529885342` |
| [data/stats/independent-autonomous-report.json](https://github.com/takechanman12250711-oss/chappy-boatrace-ai/blob/269d4783067e2d89f9d79fab047545f2d22c9d7e/data/stats/independent-autonomous-report.json) | `83182c62352f84f341a2228b1e309cc75b654ed2` |
