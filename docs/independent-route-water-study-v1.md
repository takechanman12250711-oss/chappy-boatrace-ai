# 独立した進路・当地・水面の研究 v1

前回の `independent-partner-selector-v1` を保持したまま、条件付き進路の根拠と当地成績の部分比較を追加する研究版。`independent-partner-selector-v2` として固定し、snapshot-v5の `routeWaterStudy` へ保存する。販売・コロがしへの接続、予想性能の実証、全8段階の完成は含まない。

## 公式材料と条件付き進路

同じ締切前の公式input・judgmentContext・flowStudy・partnerStudy.contextだけを使用する。新規のネットワーク取得や通常AI評価の取り込みはない。実進入、登録番号、公式履歴の対象期間・原本SHA、コース別平均スタート順位の参考条件は前版の検査を維持する。

`independent-route-water-v1.cjs` は、一意な逃げ／まくりの参考枝に対して6艇の想定進路、すぐ内外の艇、圧力を受ける内艇、攻め艇のすぐ外で追走する艇、同じ想定領域の競合候補を保存する。艇番ではなく実進入で対応させる。まくりの内側艇も立て直し候補として残す。想定領域が同じという理由だけで艇を除外しない。

これらは「主展開が成立する」「旋回する空間が残る」等を条件とする仮説。展示STを実際の1マーク到達順・距離差へ換算しない。実際の旋回順、空いた進路、旋回技量は未観測と記録する。主展開が未確定なら進路もunknown。差し・まくり差しを自動で主展開へ格上げしない。

公式contextの風向・風速・波高・潮位／潮流は値と出典参照を一緒に保存する。風速0は無風として区別し、風向不明・欠測・潮情報の未取得は0へ補わない。潮情報はliveTideAvailableと実値を両方確認する。水面の情報は同レース共通の条件であり、艇別の風・潮への適性や実際の進路を証明しない。**気象別の艇順位付けは未実装**。既存通常AIの水面加点・場別固定点を取り込まない。

各参照はinputHash／contextHash、艇番号、フィールド名、実値へ解決できる。判断全体のevidenceHashと再計算一致を検査する。sourceUrlsは公式解析元であり、contextのhashを取得元HTMLのhashと説明しない。

## 当地の比較を第6段階に接続

展開・コース・ST・展示・残し／拾いを先に扱い、前段階が完全同値の場合だけ、公式出走表の当地2連率・3連率を**両方**比較する。一方が両率で同等以上かつ一つ以上で上なら優位、逆方向なら比較不能、両方同値なら次の技量へ進む。上位段階の優劣・競合を当地率で覆さない。

登録番号欠測、率欠測、2連率が3連率を超える矛盾、両方0で未出走と実績0を区別できない場合はunknown。比較が当地段階へ到達した時点でunknownなら止め、技量で穴埋めしない。既に上位で決まった比較まで一律に見送りへ変更しない。

公式欄には当地出走母数・対象期間がないため `sampleCount=null`、`period=null`、`referenceOnly=true` を明示する。2連率は1〜2着、3連率は1〜3着の合算参考値であり、2着・3着それぞれの確率や同じ気象条件下の適性ではない。母数がそろった統計検証の代わりにしない。この未検証仮説による変更は研究記録内だけに限定する。

主役と6艇の役割を保ち、相手全20通りを作ってから部分順位による候補集合を残す。最大7点を超える場合は全体見送り。同列の先頭切り捨て、点数埋め、オッズによる増減はない。

## 締切前保存と方式別比較

`config/independent-route-water-study-v1.json` に根拠・選定のコードSHA、比較元、点数上限を固定する。既存live-noteでsnapshot-v5を作り、旧candidate、flowStudy、partnerStudyも同じ入力から保存する。既存artifactのID/digest/run/head/締切前確認を検査する。旧v1〜v4を補完せず、従来コホートの初回sealと新研究の初回v5 sealを分離する。

既存 `escape-main-audit.yml` が `data/stats/independent-autonomous-report.json.routeWaterStudy` を更新する。比較元は同じv5入力のpartnerStudy（selector-v1）であり、旧展示優位候補や別時刻の初回v4ではない。同一レース・同点数だけpairedとし、追加的中／失った的中／純増を集計。全候補成績、見送り、比較元見送り、異点数、未確定、返還等の除外は別に保持する。1券100円の仮想会計。実購入・販売成績ではない。

coverageではレース単位の進路／気象／潮情報、艇単位の当地情報、比較ペア単位の当地段階到達を区別する。レース数・艇数・比較ペア数を混ぜて母数を膨らませない。初回reportのsourceCommitより後の新着receiptは次回集計対象。

`fullJudgmentImplemented=false`、`usableForPrediction=false`、`automaticApplication=false`、採用gate未登録を維持する。残る作業は、艇別の気象・水面適性を支える履歴、旋回技量・進路仮説の裏付け、母数付き当地／2着／3着履歴、独立期間での検証と採用条件。

検査：`node --test scripts/independent-route-water.test.cjs scripts/independent-autonomous.test.cjs scripts/independent-partner-selector.test.cjs`。
