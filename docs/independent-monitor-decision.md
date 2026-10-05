# 独立した本命・万舟の判断記録 v1

2026-10-05の自動化準備。予想方式や採用基準の変更ではなく、Chatで行った独立判断を再検討できるように保存する契約。

## 現在の不足

note-marketing-stateの取得時の公開記録から、10月4〜5日の独立原稿13ファイル（本命11、万舟2）を確認した。対象はこの明示した公開記録の範囲だけで、未投稿・見送り・全履歴を代表しない。買い目・艇評価・公式出典はあるが、8段階の判断、採否比較、着順ごとの根拠を結び付けた構造化記録はない。原文を結果後に解釈して新しい判断記録へ書き換えない。実測の内訳は `data/stats/independent-decision-readiness-20261005.json`。

## 新しいChat原稿で記録する項目

完成する `independent-monitor-note-v1` の `monitor.decisionEvidence` に次を付ける。元の本文・買い目は別途従来の監査に従う。過去原本へ後付けしない。

- `version: independent-monitor-decision-v1`、`origin: independent-human`、同一 `raceKey` / `kind`、`decidedAt: monitor.confirmedAt`。
- `stages` は `flow, course, start, exhibition, remainPickup, localWater, skill, motor` の順。各段階の `reason` と `status: observed|unknown` を記録する。observedは出典参照が必須。unknownは不足理由と空のreferencesを明示し、仮の値を作らない。
- `references` は `[{sourceSha256, quote}]`。既存monitor.sources内の非オッズ出典SHAと、そこに実在する原文の引用を使う。この検査は出典への追跡可能性を確かめるもので、引用から判断が論理的に導けることまで証明しない。
- `scenario` は `type: escape|upset`、`primaryActor`（艇番）、`reason`、`references`。escapeは公式の実際の1コース艇と一致させる。upsetは `innerBreakReason` を明記する。枠番だけで1コースと決めない。
- `candidates` は実際に検討した券だけを記録する。各候補に `ticket`、一意の整数 `priority`、`decision: selected|rejected`、採否の `reason`、`references`、`roles` を持たせる。rolesは1〜3着の順に `position, boat, reason, references`。selectedをpriority順に並べた券は保存買い目の順序まで完全一致させる。除外候補を水増しせず、未検討の全120通りを検討済みとしない。

`save-independent-monitor-note.js` はこのフィールドがある場合、保存前に検査する。不整合は保存せず停止する。旧原稿にフィールドがない場合は従来どおり扱い、`legacy_unstructured` と区別する。手順例は単体テストのsynthetic fixtureだけを参照し、fixtureを本番へ送らない。

## 自動化への次の条件

このv1は人の独立判断の記録であり、`automaticReady` は常にfalse。構造化記録が揃っても自動選定・公開・採用を有効にしない。

次は実際の締切前Chat原稿にこの形式で記録し、共通の入力から候補・採否を再計算できる独立した判定関数を固定する。推測で数値閾値や同順位の決め方を埋めず、欠測・見送り・買い目上限を明示する。固定後に新しい締切前入力で前向き比較し、当たり外れを問わず対象と見送りを保存する。既存公開原本を候補の前向き成績へ流用しない。採用gateは未登録で、性能改善は未実証。

Work定期タスク・追加collector・有料AI APIは作らない。通常AIの買い目・候補を独立判断の代わりにしない。記事は既存の200円・中心1〜7点・展示後・締切余裕120秒超・原子的予約・公開URL確認の経路を維持する。

役割評価からの候補生成と締切前比較の実装は [independent-role-selector.md](independent-role-selector.md)。これは人の評価入力を必要とする研究用再選定で、無人の独立予想完成ではない。`monitor.ruleInput` と見送り理由を保存し、GitHubリモート確認済みの新しい記録だけを比較する。
