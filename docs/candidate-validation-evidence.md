# 候補の評価根拠の保存

`practicalSelectionEvidence.candidateValidationEvidence` は、通常購入資格と独立展開拡張資格を分けて保存する診断用の追加項目。予想の選定・並び・点数・優先点・購入方針・note本文は変えない。予想改善や候補採用ではない。

## 内容と読み方

- version: `candidate-validation-evidence-v1`、status: `captured`、`resultUsedForGeneration=false`。
- `poolTickets` は通常の候補24券を含む本線・押さえ・フォーメーション・万舟・展開候補の正確な3連単集合（最大120種類）。全件を購入対象や成績母数にしない。原稿の `candidate24Tickets` とは ticket の完全一致で照合する。
- `observations` は券とカテゴリごとの検査結果。`purchaseEligible`（通常購入条件）と `expansionEligible`（独立展開による8〜10点への追加条件）を別に読む。後者falseや `CANDIDATE_ONLY_EVALUATION` だけで前者falseと推測しない。
- `validBranchIds` / `validPurchaseBranchIds` / `validIndependentBranchIds` / `validScenarioIds` / `requirementIds`、検証済み `coverage`、元候補の `physicalCoverage`、優先点、`invalidReasons` を保持する。物理候補の役割だけで検証済み購入枝の代用をしない。
- `branches` は参照枝のid・券・展開ID・種別・由来・役割・既存の根拠検査と点数だけを保持する。観測の `validPurchaseBranchIds` に含まれる枝を照合する。異なる枝・カテゴリの断片を合成して成立根拠を作らない。元の巨大な展開ツリー、オッズ、公式結果は複製しない。
- stage=`selection` は実際の選定中の検査。上限で処理が止まった後の候補等は、同じ締切前入力・検査器によるstage=`pool-audit`として明記する。後者は新しい選定や実際の除外理由の証明ではない。同内容は重複保存しない。
- `finalSelectedTickets` は全選定処理後の券。途中のcandidateDecisions.selectedとは別物。既存の比較理由・境界・除外履歴は従来のcandidateDecisions/targetDecisionsと併読する。

## 保存と互換性

`js/practical-selection.js` が副次情報を返し、既存 `scripts/practical-selection-evidence.js::capture` が許可項目だけを独立コピーする。券集合・種類数・観測対象・stageが不整合なら副次情報だけ `invalid-or-unavailable` とし、有効な元予想は保持する。生成中の監査失敗は `capture-error`。欠測した項目をfalse・0として補わない。

既存 `collect-all-race-notes.js` → `outer-attack-live-source` / `note-draft-bundle` の経路を使う。公開監査で止まったレースにも前者の原本が残る。新しいcollector、cron、結果による再生成は追加しない。旧practical-selection-evidence-v1の読者は追加項目を無視でき、旧原本は追記・更新しない。

2026-10-16の修正以降、日次 `collect-predictions.js::compactPracticalSelection` も同じcapture検査を再利用し、`prediction.practicalSelection.candidateValidationEvidence` に保存する。対象は新規生成時に既存選定器が返した副次情報のみ。元券との不一致は `invalid-or-unavailable`、例外は `capture-error`。旧形式の欠測は欠測のままとし、過去レースを再生成しない。既存日次データを再縮約する際にも外側のpracticalTicketsを照合し、保存済み根拠を保持する。

PR #1319/#1322の2・3着研究で読んでいたtargetDecisionsは画面用の件数制限がある。このpreviewだけで「構造化役割なし」と断定せず、全候補のobservationsと参照branchesを読む。note原本の既存保存と日次側の旧欠測を区別する。branchが未適格ならその事実を保持し、別枝の役割を組み合わせて購入資格を作らない。日次保存の修正は予想改善の実証や候補の本番採用ではない。

検査: `node scripts/test-daily-candidate-evidence.cjs`。実選定器のfixtureでpreview外の候補保持、元のcompact全項目一致、再縮約の同値性、券不一致拒否、旧形式と独立コピーを確認する。固定100R待ちは設けない。main反映後の実レース原本での保存確認は、fixture成功とは別に記録する。

`js/practical-selection.js` は方式指紋の対象なので、買い目が同じでも指紋は更新される。旧固定100枠・receipt・凍結selectorは保持し、今後の方式別最初の100枠へ分離する。旧方式を新方式に改名・合算しない。

## 検証

`scripts/test-candidate-validation-evidence.cjs` は変更前commit `429663f3a86cfc8cd345258f47412c6787806fe8` の実選定器と既存の多様なfixtureで比較する。追加項目以外の選定結果全体の一致、候補の資格、カテゴリ分離、結果/オッズ不使用、120種類とサイズ、独立コピー、旧形式、不整合を検査する。これは保存変更の互換性検査で、性能比較ではない。将来の承認済み選定変更では比較基準も明示的に更新する。

既存note回帰CIで実行し、`test-all-race-notes.js`で原稿原本および公開不可時の研究原本までの保持を確認する。CI/fixtureによる保存成功と、main反映後の実レースにおける締切前保存の確認は別に報告する。

## 救済置換後の不一致診断

新規captureで既存3コース/4カドの固定救済が元の最終券を置換した場合も、`candidateValidationEvidence.status=invalid-or-unavailable`を維持する。診断を追加しても最終券の根拠を有効化せず、救済券へ役割・購入資格を付け足さない。

元snapshotが自身の元券集合に対して既存capture契約を満たし、既知version・救済券・置換元・末尾index・説明と置換前後の順序が完全一致した場合だけ、`diagnostic`（`candidate-validation-mismatch-diagnostic-v1`）を保存する。`originalGeneratorSnapshot`は元の候補観測・枝・役割・最終券を既存allowlistで独立コピーし、`transformations`は既存救済metadata、`observedFinalTickets`は置換後の実券とする。`purpose=diagnostic-only`、`usableForPrediction=false`、`resultUsedForGeneration=false`を固定する。元snapshot内の`captured`は置換前の保存状態であり、最終実券の適格性ではない。採否のselectedフラグ・不採用理由を最終採否へ書き換えない。

診断は1段だけで、循環・過深・protoキー・1MiB超の入力を保持しない。既知救済が複数有効、metadata不正、元観測不整合なら従来のinvalidだけを保存する。再縮約は同じ元snapshot・変換・実券を再検査して保持し、診断のない旧invalidや旧原本を修復しない。研究consumerは外側のstatusを必ず読み、入れ子の元snapshotを購入資格・新しい成績母数へ転用しない。

これは診断の欠落を防ぐ変更であり、救済選定・予想方式・買い目・役割根拠・精度を変更するものではない。回帰は既存`test-daily-candidate-evidence.cjs`で両救済、役割なしの保持、変換改変の拒否、旧invalid保持、独立コピー、再縮約の同値性を検査する。
