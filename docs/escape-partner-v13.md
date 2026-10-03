# 1逃げ相手補正 v1.3 — PR #1163

## 変更範囲
全24場の共通セレクタに適用する。既存の強逃げ成立条件を満たし、1号艇が1コースの新規・締切前予想だけが対象。追加候補は既存の購入可能判定を通り、同一シナリオ・同一出典内で1着軸、2着残し/攻め、3着残り/拾いの役割が成立していることを要求する。得点だけで候補を新設しない。

既存の1-2-3、1-2-4、本線、フォーメーションの組、別頭券を保護し、残る1号艇頭の券だけを優先度が厳密に高い候補へ同じ位置で1対1置換する。点数・賭金を増やさない。アプリ、note、保存証拠は同じ選択結果と採否理由を使う。買い目カテゴリを空欄にして保護を解除しない。採用候補と除外候補の記録も同時更新する。

## 過去記録の保護
締切後・結果利用・日付不明の通常呼出しでは新補正を適用しない。古い予想世代の成績を変更しない。分析で明示的に `select(prediction, {escapeRolePartner: 'replay'})` を指定した時だけ、同一の本番処理を過去入力で比較できる。過去回帰テストの期待値は元のmainと同一のまま維持する。

## 検証結果と限界
979Rの保存済み入力を現在コードで再生成した同点数のペア比較。これは前向き検証でも実購入収支でもない。1点100円の仮想集計。

| 指標 | 補正なし | v1.3 |
|---|---:|---:|
| 的中数 | 300 | 312 |
| 点数合計 | 8,293 | 8,293 |
| 投資額 | 829,300円 | 829,300円 |
| 払戻額 | 604,390円 | 618,940円 |
| 回収率 | 72.88% | 74.63% |

新規的中17R、失った的中5R。変更239R。全24場に検証対象が存在する。全979Rで点数・保護券・別頭不変を確認し、変更レースでは最終買い目と採否/検証記録の一致を確認する。5例で新規予想の通常経路、note共通経路、保存証拠の一致も検証する。

以前の43R比較はカテゴリを消す別実装だったため本番同等の採用証拠として扱わない。同じ結果を見ながら保護券を決めた経緯があり、独立した将来成績の保証はしない。回収率は100%未満で、恒常的利益や既存的中損失ゼロを意味しない。

## 再現
`node scripts/test-production-escape-role-partner-contract.js`
`node scripts/test-practical-selection.js`
`node scripts/test-strong-escape-trim-regression.js`
`node scripts/test-very-strong-escape-trim-regression.js`
`node scripts/test-practical-priority-shadow-regression.js`
`node scripts/verify-escape-partner-paired.cjs`

比較結果は `tmp-integration/escape-partner-paired.json` に生成し、CI artifactへ保存する。実戦の採用記録は `expansionSummary.escapeRolePartnerReplacement` と `verificationEvidence.generation.ticketPolicyVersion` に残る。
