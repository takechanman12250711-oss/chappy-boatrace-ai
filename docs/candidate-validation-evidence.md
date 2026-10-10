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

既存 `collect-all-race-notes.js` → `outer-attack-live-source` / `note-draft-bundle` の経路を使う。公開監査で止まったレースにも前者の原本が残る。新しいcollector、cron、結果による再生成は追加しない。旧practical-selection-evidence-v1の読者は追加項目を無視でき、旧原本は追記・更新しない。日次予想の縮約保存に本項目が必ずあるとは説明しない。

`js/practical-selection.js` は方式指紋の対象なので、買い目が同じでも指紋は更新される。旧固定100枠・receipt・凍結selectorは保持し、今後の方式別最初の100枠へ分離する。旧方式を新方式に改名・合算しない。

## 検証

`scripts/test-candidate-validation-evidence.cjs` は変更前commit `429663f3a86cfc8cd345258f47412c6787806fe8` の実選定器と既存の多様なfixtureで比較する。追加項目以外の選定結果全体の一致、候補の資格、カテゴリ分離、結果/オッズ不使用、120種類とサイズ、独立コピー、旧形式、不整合を検査する。これは保存変更の互換性検査で、性能比較ではない。将来の承認済み選定変更では比較基準も明示的に更新する。

既存note回帰CIで実行し、`test-all-race-notes.js`で原稿原本および公開不可時の研究原本までの保持を確認する。CI/fixtureによる保存成功と、main反映後の実レースにおける締切前保存の確認は別に報告する。
