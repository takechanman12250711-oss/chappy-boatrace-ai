# 長期公式履歴の2着・3着回数

`build-race-stats.js` が既存の公式結果から出力する
`data/stats/racer-skill-patterns.json` の
`racers[registerNo].windows[all3Years|recent1Year|previous2Years].byCourse[course]`
に `seconds`（rank=2）と `thirds`（rank=3）を追加する。

- 艇番で公式スタート記録と結合し、その実進入コースへ集計する。枠番別・場別の率ではない。
- 期間、出走数、勝数、3着内数、ST、決まり手、閉場日の判定は既存のまま。
- 各コースで `top3 = wins + seconds + thirds`。観測済みの0回と、旧ファイルに項目がないことは別。旧欠測を0へ補完しない。
- schemaVersion=1への追加項目。旧consumerの投影項目と旧sealは変更しない。再生成ファイルのSHAは変わるため、新しい原本として扱う。
- 既存の結果収集による派生履歴更新を使う。新cron、Work監視、追加の全期間再集計ジョブは作らない。原公式結果・保存予想を変更しない。

## 既存材料との区別

気象履歴v2はすでにfirst/second/thirdを持つが、保存入力と結合できた限定標本の場・コース別集計である。
2026-10-12生成の保存ファイル（SHA256
`1520bd191b6a356483265842316ff95ca18ea91ba98bffe88b5ebad9d2bf518f`）では
採用1,548R、9,288艇、8,268選手・場・コース群、最大6走/群だった。
長期のコース履歴と同じ母集団ではなく、既存の各期間12走の条件を緩めて代用しない。

今回の追加は相手研究の材料整備のみ。独立context、selector、買い目、採用gateは変更しない。
新しいconsumerへの接続は、原本SHA・生成時刻・期間・登録番号・実進入・回数整合性を確認し、
旧原本と分離する別工程。データ更新だけで的中率改善や利用開始を主張しない。

## 検証

`node scripts/test-racer-skill-positions.cjs` は小さい合成公式結果で、
2・3着を異なる回数に分けること、実進入の枠との入替、期間別集計、観測0、
3着内数との一致、未閉場日の除外、旧consumerの追加項目無視を検査する。
`test-racer-skill-cutoff.cjs` とともに既存の Check racer skill ST history で実行する。
合成結果の成功、本番での派生ファイル再生成、研究consumerへの接続は別の確認段階。
