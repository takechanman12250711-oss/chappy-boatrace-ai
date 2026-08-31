# 外攻め買い目A/B 中央監視 v1

## 目的

ブラウザごとの `localStorage` だけに残っていた外攻め買い目A/B shadowを、GitHub上の中央データとして結果前に不変保存し、BOAT RACE公式結果だけで同資金比較する。

本機能は検証専用であり、本番予想・買い目・最大点数・資金配分・表示を変更しない。候補Bを自動採用しない。

## 処理順序

1. `Collect automatic race predictions` 完了後に、当日の完全な予想ソースを復元する。
2. `analysis-input-contract.js` の締切前契約を通過した予想だけを対象にする。
3. 既存 `outer-attack-ticket-shadow-v1` をそのまま実行する。
4. 外攻め信号が保存対象となったshadowを、中央初回取得時刻付きで不変保存する。
5. 同一 `captureKey` の内容が後から変わった場合は、初回版を残して `blocked-preserve-first-central-capture` を記録する。
6. `Collect official race results` 完了後に、公式結果の上位3艇と3連単払戻へ正規化する。
7. 中央取得が公式結果確認より後だったレースは `missed-pre-result-central-capture` として正式比較から除外する。
8. 1レースに複数の結果前shadowがある場合は、結果前の最新予想を採用し、古い版を重複集計しない。
9. 既存settlementと固定decision gateで、押さえ・フォーメーション・万舟を100R、250R、500Rまで集計する。
10. 最終採用は人が判断する。件数到達や成績だけで本番へ自動反映しない。

## 生成ファイル

- `data/stats/outer-attack-ticket-central-shadow-archive-v1.json`
- `data/stats/outer-attack-ticket-central-settlements-v1.json`
- `data/stats/outer-attack-ticket-central-report-v1.json`

## 実行方法

```bash
node scripts/build-outer-attack-ticket-central-monitor.cjs --mode=capture --date=20260831
node scripts/build-outer-attack-ticket-central-monitor.cjs --mode=settle
node scripts/build-outer-attack-ticket-central-monitor.cjs --mode=all --date=20260831
```

`--date`を省略した場合は、`SOURCE_WORKFLOW_CREATED_AT`または実行時刻からJST日付を決める。

## 固定された安全条件

- 対象予想は締切前契約に合格したものだけ。
- 公式結果は買い目生成に使用しない。
- 中央初回保存後のshadow差し替えを拒否する。
- AとBの点数・投資額・本線不変条件は既存shadowのinvariantsを使用する。
- オッズで買い目を作成・削除しない。
- 本番買い目への自動適用は行わない。
- 採用にはユーザー承認が必要。

## 集計の読み方

`pipeline.eligibleSettlementCount` が正式比較件数である。`immutableSnapshotCount`には同一レースの途中予想も含まれるため、正式件数とは一致しない。

各候補の現在地は `nextMilestones.cover`、`nextMilestones.flow`、`nextMilestones.hole` に保存する。固定判定条件は既存 `outer-attack-ticket-decision-gate-v1` を変更せず使用する。

## データフロー

```text
締切前予想
   │
   ├─ 締切前契約NG ─────────────→ 除外
   │
   ▼
既存の外攻めshadow
   │
   ├─ 同一captureKey改変 ──────→ 初回版を保存・改変をblocked
   │
   ▼
中央不変archive（結果前）
   │
   ├─ 結果が中央保存より先 ────→ missedとして除外
   │
   ▼
BOAT RACE公式結果
   │
   ▼
同資金 A / 押さえB / 流しB / 万舟B
   │
   ▼
100R → 250R → 500R
   │
   ▼
人が採否を判断（自動採用なし）
```
