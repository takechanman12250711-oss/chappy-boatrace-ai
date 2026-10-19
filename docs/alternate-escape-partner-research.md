# 代替逃げ展開の相手選定比較

`scripts/compare-alternate-escape-partners.cjs` は候補 `alternate-escape-partner-roles-v1` を、締切前に保存した入力だけで比較する研究用処理です。候補定義時刻は `2026-10-19T01:55:00Z` に固定します。通常のブラウザ・収集・公開処理は研究オプションを渡さないため変わりません。

主展開が逃げ以外でも、代替の逃げ展開に対応した残し・拾いを再評価し、その展開の相手を生成します。候補 VM だけで `ChappyAICore.mergeWithPrediction(basePrediction, data, {researchAlternateEscapePartnerRoles:true})` と `ChappyPracticalSelection.select(prediction, {researchAlternateEscapePartnerRoles:true})` を呼びます。既存本命頭・本線券集合・展開スコアは維持します。本線券が変わる行は `candidate-main-tickets-changed`、現行と実戦点数が違う行は `candidate-ticket-count-mismatch` として比較から除外します。点数を増やして成績を改善したとは扱いません。

既存 frozen reader の日次 primary 優先、適格 note の評価、レースごとの保存時点選択、公式結果の検査を再利用します。保存された本命頭・実戦券集合・全展開スコアのすべてを現行 VM が再現した行だけで候補を評価し、対象母数・再現率・除外理由を残します。旧世代 `ai-core-v4.8.6-escape-skill-role` と現行 `ai-core-v4.8.8-adjacent-start-rank` を受け入れますが、世代名の一致だけで再現成功とはしません。

6艇分の公式進入・展示 ST・展示タイム、保存済み履歴、取得時刻と締切前保存が必要です。欠損を現在の API・履歴・結果から補いません。圧縮原本はメタデータと SHA-256 を検証してメモリで読み、元の予想ファイルを書き換えません。結果も保存済みの公式記録だけを読みます。

出力は `data/stats/alternate-escape-partner-comparison.json` です。候補 ID・定義時刻・候補コード SHA・全読込 JS SHA・入力ファイル SHA、本命頭と点数の不変条件、追加的中・消失的中・純増、的中率・回収率を記録します。日次 primary、verification、note、24場、定義前の discovery と定義後の再計算を分けます。未確定は pending、返還・不成立は除外、母数なしの率は null です。金額は各券100円の仮定です。

今回の過去データは候補作成前に結果や旧候補の成績を確認した期間を含みます。定義後に保存された入力の再計算も、候補自体の締切前保存を証明しません。締切前に保存した前向き候補、未使用 holdout、正式採用の証拠とは呼びません。`INSUFFICIENT_EVIDENCE`・`usableForPrediction=false`・本番自動変更なしを維持します。

既存 `Compare frozen escape predictions` workflow を利用し、新しい cron は作りません。PR は head SHA を checkout してテストと新比較を GitHub Actions で実行し、artifact `alternate-escape-partner-comparison` を残します。PR ではレポートを branch/main に commit しません。既存 four-inner guard の定義・レポートと main の保存経路は維持します。ローカルでは小さな入力例のテストだけを行い、大規模比較は Actions で実行します。

## 既に選ばれたイン頭の相手順を使う v2

v1 の実データ比較では、再現できた197R・確定186Rで券の変更が0件でした。的中43件・回収率72.20%は現行と同じで、改善実証にはなりません。v1 の定義とレポートを保持し、別候補 `selected-escape-partner-order-v2` を `2026-10-19T02:17:17Z` に定義します。

v2 は通常の `createPrediction` と通常実戦厳選を先に実行し、その買い目に実1コースの頭が既に含まれる場合だけを対象にします。通常選択が保存した captured な購入枝の1着根拠から、通常実戦厳選への採用資格を対応照合します。新しい1着資格を作ったり、物理候補を購入候補へ格上げしたりしません。代替の逃げ展開から、既存の safety 配列の相手順を使って対象頭の非本線・非流し K 券を上位 K 券へ置き換えます。新しい採点式や閾値探索は追加しません。成績の金額は各券100円の仮定です。

比較器は v1 の保存入力読取・現行完全再現・公式結果・同点数判定を再利用します。さらに頭別の券数、対象外の頭の券集合、本線・流しの券と区分を固定します。守れない行は理由を明記して除外します。補助 JS は候補 VM だけで読み込み、通常選択や v1 に接続しません。

`scripts/compare-selected-escape-partners.cjs` が専用レポート `data/stats/selected-escape-partner-comparison.json` を出力し、既存 PR workflow が artifact `selected-escape-partner-comparison` として保存します。v1 の artifact と別に、定義時刻・fingerprint・全 JS SHA・追加/消失的中・回収率・不変条件の除外・不変更理由を残します。今回の過去期間は既に結果を確認している発見用データです。前向き保存や未使用 holdout と呼ばず、本番採用は自動化しません。
