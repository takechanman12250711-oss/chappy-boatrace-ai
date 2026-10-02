# Phase3 完了境界

Phase3 のコード実装は、予想保存 → 公式結果 → 分析 → prospective A/B → 統合ゲート → candidate の承認待ちハンドオフ、までとする。

- candidate 以外は本番適用不可
- candidate も自動適用禁止
- ユーザー承認前は productionChanged=false / productionApplied=false
- 実データ件数未到達時は collect-more-settled-races とし、追加実装を増やさない
- 承認後の本番変更は別PRで内容を明示して行う

これにより、Phase3 の実装はデータ蓄積待ちと分離して完了扱いとする。
