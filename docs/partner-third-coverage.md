# 3着根拠を保護する研究比較

本番未採用。`partner-third-evidence-guard-v1` は既存 D の喪失7件を見た後に設計した探索仮説で、前向き検証ではない。今回の結果に合わせた閾値探索・係数調整を行わない。

## 固定した仮説

既存凍結 selector の D を最初に計算する。その置換で削除される保存券のいずれかに、保存済み stage observation の3着 hold/pickup 根拠があれば、全体を保存券 A へ戻す。追加券のいずれかが既存 completeRoles 判定を満たさない場合も戻す。そうでなければ D を使う。艇番固有の条件、点差の閾値、オッズ、結果は使わない。

3着根拠は候補の券・艇・着順・役割・branch を照合する。一つでも保存観測があれば保護し、複数の不完全な観測を合成して追加券の完全な根拠にしない。根拠が記録されていないことは「3着になれない」証明ではない。この案は保守的な制約で、予測確率モデルではない。

同じ1・2着組が残っていても、独立券が1枚だけ残っていても、3着同士の1対1置換でも確認する。点数・頭別点数・独立券は固定。局所的な買い目の再配分を追加せず、一括で A に戻す。既存の全役割優先 `coverageFirst` と違い、順位表の作り直しではなく D の削除根拠を制限する。比較では既存 coverageFirst も同じ入力で併記する。

## 再現

```sh
node --test scripts/test-partner-third-coverage.cjs scripts/test-partner-forward.cjs scripts/test-escape-partner-history.cjs
node scripts/research-partner-third-coverage.cjs 068be22355b2a61f0000507662452cf2535e14cf research-output/partner-third-coverage.json
```

固定 commit の保存100枠 report を入口に、receipt・source SHA・方式・締切・公式展示・保存選定証拠を検査し、A/B/D の券と順序を全件再現する。不一致・欠損は全体を停止し、都合のよい行だけで成績を出さない。全候補を生成した後にだけ公式結果を開き、既存と同じ精算関数で比較する。A/B/D の精算値、未確定・除外の一致も必須。

出力は研究用の別ファイルで、元の report・receipt・bundle や予想経路を書き換えない。既存の凍結 selector は変更しない。CLI は正確な入力 commit と新しい出力先を要求し、上書きせず、保存 data 配下への出力を拒否する。Git の部分取得環境では不足 blob の通常取得が必要。

100枠以内の限定診断用であり、定期・大規模な再分析を Work で回さない。新 cron・収集器・自動採用は追加しない。結果が良くても未使用の将来データと別の採用判断が必要。仮想1券100円の回収率と、本人の実購入成績を分ける。
