# 独立研究の気象別履歴 v1

## 目的と境界

当地2連率・3連率だけでは母数、期間、気象条件がわからない。既存の日次保存入力と公式結果を結び、選手・場・実コース別に、風向・風速(m/s)・波高(cm)が完全一致する履歴と母数を保存する。各艇へ渡す研究材料であり、適性スコア、順位、買い目は作らない。採用gateは未登録、`usableForPrediction=false`、`automaticApplication=false` を維持する。

## 入力

- `data/predictions/YYYYMMDD.json` のprimary/verificationだけ。通常AIの点数、券、オッズ、同梱結果は参照しない。圧縮日は既存archive正本をSHA検査して復元する。note原稿や全開催はこの母集団に含まない。
- 当日を含めない過去90暦日。JST実行日をasOfDateとし、前日までを対象にする。全期間の再集計や追加取得をしない。
- schemaVersion=4、公式ラベル、取得・保存が締切前、非遡及、登録番号6名・展示実進入6コースと公式mappingを必須にする。欠損を現在値で補わない。
- 同じraceKeyは有効primaryを優先し、同じ区分では最新の保存時刻を使う。結果を見て保存入力を選ばない。
- 日次公式結果が一意で確定、確認時刻が締切後かつ集計時刻以下、全6艇の登録番号・順位・実進入が一意、3連単と上位3艇が一致するものだけを結合する。F/L、返還、不成立、同着、不完全な着順、登録不一致は除外する。
- 履歴のコースは**結果の実進入**。展示から変更されたかをevidenceに残す。未来のレース照合には取得済みの展示実進入を使い、本番進入を知っているとは扱わない。

## 集計と根拠

`data/stats/independent-weather-history.json` に期間、生成時刻、sourceCommit、固定builder hash、入力/結果ファイルの生バイトSHA、raceKey別の投影hash・時刻・風波・結果登録番号/実進入/順位を保存する。原本HTMLのSHAではない。原本予想・結果を書き換えない。

選手×場×コースの全保存条件を `allWeather`、風向/風速/波高の完全一致を `byWeather` とする。任意の強風閾値や場の水質分類で代用しない。0m/sはcalm、方向不明の非ゼロ風、文字列数値、波高欠損は不明。観測された潮の局面だけ `byTide` へ分け、潮位だけから上げ潮・下げ潮を推定しない。

各集計は starts / first / second / third / other と最初・最後の日付を持つ。率は各着の回数÷starts、0件の率はnull。2連率を2着率とは呼ばない。`allWeather` は条件一致群を含むため独立した対照群ではない。また、保存された入力と6艇正常完走への条件付き集計であり、選手の全出走成績・因果的な適性・予想的中率ではない。期間内の保存対象の偏りや少数標本を残したまま、正式な優劣を判断しない。

## 締切前接続

snapshot-v6の `weatherHistoryStudy.context` に、各艇の同場・同コースの全保存条件、完全一致の風波、観測潮局面の母数と各着率を保存する。履歴ファイルのSHA・生成時刻・期間・sourceCommitも固定する。履歴が入力取得より未来、当日以降を含む、固定builderと不一致なら利用不可。履歴なし、条件未観測、条件一致0件、潮不明を区別する。

旧v1〜v5は変更せず再生できる。v6の初回締切前リモートsealを新材料用の別コホートとし、先に封印されたv5のrouteWaterStudyや旧方式の候補・見送りを置換しない。新材料は既存candidate/flow/partner/routeWaterの選定に渡さない。過去の原本へ後付けしない。

## 自動実行と検証

既存 `escape-main-audit.yml` の日次処理内で90日の履歴を作り、派生ファイルだけを保存する。既存live-noteが次の取得からそれを使う。新しいcron、Work監視、API契約は追加しない。main直後のlive-noteが日次保存より先なら、その初回v6は履歴なしのまま固定する。次の既存実行で使われることと、既存sealの補完を区別する。

`independent-autonomous-report.json.weatherHistoryStudy` は初回v6の件数、履歴の利用可能レース数、条件一致の履歴を持つ艇数、潮不明、各艇statusを記録する。レース数・艇数・過去startsを合算しない。新しいreceiptが集計checkoutより後なら次の日次対象となる。

検証は `node --test scripts/independent-weather.test.cjs scripts/independent-autonomous.test.cjs`。実行成功・材料が付いた実レース・適性判断・精度改善は別々に報告する。次工程は標本分布の確認と、展開等の上位判断を覆さない適性比較条件の事前固定・別版での前向き評価。
