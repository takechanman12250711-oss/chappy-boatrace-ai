# 独立した本命・万舟の役割選定 v1（研究用）

2026-10-05。`independent-monitor-decision-v1` に続く、**Chatで評価した役割から候補を再現する処理**。公式データを読んで展開・役割を無人で判断するエンジンではない。通常AIの予想を独立予想へ流用せず、数値閾値・重み・オッズ基準を新設しない。noteの購入対象と本番予想は変更しない。

## 入力と固定した処理

新しい締切前の独立原稿に `monitor.ruleInput` を任意で付ける。旧原本へ後付けしない。

- `version: independent-role-input-v1`、`raceKey`、`kind`、`decidedAt` は独立原稿と同一。`scenario` は `decisionEvidence.scenario` と同一にする。
- `limit` は締切前に決めた元の中心買い目と同じ点数（1〜7）。選定器へ元の買い目を渡さず、比較の点数だけ合わせる。
- `roles` は1〜3着順の3行。各行に `position` と、6艇すべての `boats: [{boat, eligible, reason, references}]` を記録する。eligibleはtrue / false / null（未確認）。採用だけでなく除外にも根拠が必要。nullは不足理由と空のreferencesで記録する。
- `stages` は `flow, course, start, exhibition, remainPickup, localWater, skill, motor` の8行。statusはdecisionEvidenceと一致。observedは1〜3着の `roles: [{position, groups, reason, references}]` を持つ。
- `groups` はその段階・着順に対する**人の根拠付きの優先群**。例 `[[2,3],[4],[1,5,6]]` は2・3が同順位、次に4、その次に1・5・6。全6艇を重複・欠落なく含める。艇番順、オッズ、結果から自動で群を埋めない。
- unknownの段階は不足理由、空のreferences、`roles: null` を記録する。未知を最下位や同順位へ置き換えない。
- referencesは既存のentry / exhibition公式出典のSHAと実在する引用。引用の存在確認は役割評価の正しさを証明しない。

v1は宣言された主展開の1着候補を1艇とする枝だけを対象にする。本命は実進入の1コース艇、万舟は明示された主役と内側が崩れる理由を必要とする。複数の頭を同時に扱う原稿はそのまま保存し、研究候補は `single_main_branch_required` で見送る。万舟という名称から配当の閾値を設けず、高配当を保証しない。

役割が成立する全組み合わせから同艇重複を除いて候補を生成する。券を2つ比べるときは8段階の順に評価する。その段階で1〜3着の役割のすべてが相手以上、少なくとも1つが上なら優先する。すべて同順位の場合だけ次の段階へ進む。「2着側は上・3着側は下」のように競合する場合は優劣未確定とし、勝手に2着を優先したりモーターで逆転させたりしない。

他候補に劣らない群を順に取り出し、群を丸ごと加えて固定点数に収まる場合だけ採用する。点数境界をまたぐ同順位・比較不能群は `ambiguous_cutoff` で**研究選定全体を見送る**。候補不足は `candidate_shortfall`、未確認評価は `incomplete_role_evidence`。末尾を艇番順で切らない。群内の文字列順は表示順に限り、採否を変えない。

## 保存・締切前の証拠・結果照合

1. 既存 `save-independent-monitor-note.js` が、通常の原本監査に合格した新原稿について別枠 `independentRuleShadow` を作る。本文・中心買い目・monitorは保持し、研究候補への差し替えはしない。不一致の持ち込みshadowは停止する。ローカル保存だけでは `forwardEligible: false`。
2. 既存 `live-note.yml` がnote公開への受け渡しを先に行った後、当日の独立原稿だけを確認する。元ファイルSHA・固定コードhash・記録と再計算の一致を確かめ、候補と見送りをGitHub artifactへ保存する。通常AIや結果ファイルは候補作成に使わない。
3. artifactのID・digest・実行ID・headとGitHubの応答時刻を照合する。確認時刻が締切前のものだけ `data/independent-rule-forward` へ不変receiptを保存する。HTTP時刻は秒精度の上限を使用する。遅延、期限切れ、旧原稿の入力なしは正式比較へ入れない。同じレース・種類の最初の有効なリモート確認を固定し、結果待ち・見送りを後の好都合な原稿へ交換しない。
4. 既存の日次 `escape-main-audit.yml` で `independent-rule-forward.cjs report` を実行し、`data/stats/independent-rule-report.json` へ保存する。元原稿SHAと研究計算の再一致を確認してから、既存の公式結果を照合する。返還・不成立・払戻不明・公式結果の不一致は除外、未確定はpending。

通常の収集間隔・処理待ちで締切に間に合わない場合がある。ローカル時刻を書き戻したり期限を緩めたりせず遅延として扱う。Work定期監視、新しいcron、追加の公式データcollector、有料AI APIは追加しない。研究失敗はnote受け渡し後にエラーとして残す。

成績は本命と万舟を別集計する。同じレース・同じ点数で、1点100円の比較購入額、払戻、的中率、回収率、追加的中・失った的中を示す。見送りを除いた比較と、見送りも含む元予想全体の成績を分ける。これは実購入成績ではない。

## 未完了・未実証

全保存予想を無人生成する処理ではなく、展開・役割・各段階の優先群はChatの判断を必要とする。その判断自体を公式入力から再現する処理は次の工程。人が元買い目を知って入力することによる影響も残るため、候補は「人の役割評価からの再選定」であり、完全独立な盲検比較ではない。

固定コード・契約のhashは `config/independent-rule-forward.json` に記録する。途中で方式を変更して同じ母数へ混ぜない。採用gateは未登録で `INSUFFICIENT_EVIDENCE`、`usableForPrediction=false`、`automaticProductionChange=false` を維持する。テスト内の合成レース、main反映、集計0件を実レースの前向き比較・的中率改善と呼ばない。次の実際の締切前原稿から、入力とリモートreceiptが揃った件数を確認する。
