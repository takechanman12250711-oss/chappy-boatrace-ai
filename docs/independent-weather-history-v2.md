# 気象別観測履歴 v2 — 保存noteの公式入力を補足

## 範囲

前日まで90日の日次履歴v1を保持し、日次に有効な公式入力がないレースだけ、不変の `data/note-drafts/YYYYMMDD/*.json` から補足する。既存の日次 `escape-main-audit.yml` 内でv1生成後にv2を生成し、別ファイル `data/stats/independent-weather-history-v2.json` を保存する。新cron、現在の公式情報による欠損補完、原本変更はない。

これは保存された公式入力の観測標本であり、全出走履歴でも前向き予想成績でもない。noteの生成・保存対象に偏る可能性がある。本文の監査成功は履歴の正確性や適性の証明ではない。

## 原本・時刻契約

- bundle v1、厳密なraceKeyと日付・場・R、ファイル名に含まれる原本バイトSHA、sourceCommitを検査する。
- capturedAtとselectedAtが一致し、取得 ≤ 保存 ≤ 生成監査 < 締切。監査version・raceKey・contentReadyを検査する。
- 公式入力のschema4、pre_deadline、officialResultUsed=false、公式スタート画像による6艇の実進入、異なる登録番号、風向・風速・波高を従来v1と同じ条件で検査する。欠損・遡及入力は除外する。
- 記事本文、モデルの点数、券、オッズは履歴集計に使わない。公開receiptや購入有無も条件にしない。生成時刻の保存値は過去の観測証拠であり、締切前リモートsealの証明に読み替えない。
- 同じRの日次に有効入力が一つでもあればnoteを使わない。日次の結果が不成立・登録不一致でもnoteへ差し替えない。
- note内では結果を見る前に最新の有効selectedAtを選ぶ。同時刻は原本SHAの昇順。結果不一致時に次のbundleへ戻らない。
- 公式結果の正常完走6艇、進入、登録番号、確認時刻と結果重複の扱いはv1を再利用する。結果の実進入で集計し、展示からの変更を記録する。

## 保存と件数

v2はv1の派生集計に追加分を加え、`baseline` にv1原本SHA・builderHash・採用レース数を保存する。入力日次ファイルと結果ファイルがv1生成時のSHAから変われば停止する。v1のコード・設定・ファイルは変更しない。

`noteSupplement` のexamined/eligible/dailyOverlap/duplicateBundlesはbundle件数、canonicalRaces/acceptedRacesはレース数。欠損結果ファイルの日は別記し、examinedへ入れない。coverage.predictionRecordsは日次の読込レコード＋重複除去後のnote候補数。追加レースのevidenceにはnoteSource（原本パス/SHA、commit、保存・監査時刻）が残る。除外理由を別記し、0件を欠損と混同しない。

## 今後の締切前保存

snapshot-v7は `config/independent-weather-study-v2.json` の固定コードhashを検査し、生成済みv2の材料を取得時刻以前に限って保存する。場・実進入・登録番号と風向/風速/波高の完全一致条件は緩めない。潮不明はnull、条件一致0件はゼロ母数のまま。

旧snapshot-v6とweather-v1の初回sealはそのまま再生・集計する。v7/weather-v2は方式別の新しい初回sealであり、日次reportの `weatherHistoryStudyV2` に分ける。先行baseline/flow/partner/routeWaterの初回記録を上書きしない。

材料保存のみで、適性順位・候補選定・買い目・販売・コロがしには使わない。selectionImplemented=false、fullJudgmentImplemented=false、usableForPrediction=false、automaticApplication=false、adoptionGate=nullを維持する。main反映、日次v2保存、新規実レースへのv7接続成功は別に確認する。
