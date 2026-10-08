# 無料説明と保存済み本命の整合

readable-v4 は無料の通常AI説明だけを修正する。有料本文は readable-v3 と同じで、原本・予想・買い目・点数・価格・コロがし対象・結果会計を変更しない。

旧評価の mainSheet.reason は、正式展開へ本命印と券を接続した後にも残ることがある。v4 は保存本命艇と本命券の頭、明示された verificationEvidence.mainScenario.headBoatNo が一致することを必須にする。主展開頭の欠測を攻め艇や文章で補わない。対応する本命groupの券集合が完全一致し、正式typeとlabelも既知の文法に一致する場合だけ、完全な生成文「最有力展開は〈label〉。」「〈label〉から作られた本線候補。」をコピーする。対象typeは escape / sashi / threeAttack / fourAttack。自由文の意味解析ではなく、この有限文法以外の文は使用しない。raw mainSheet.reason、任意の券コメントへのfallbackは設けない。正式頭・本命group・対応する生成文が不明・複数・不整合なら、断定できない旨を表示する。具体的な買い目は無料へ出さない。独立監視原文は変更しない。

v1/v2/v3 の明示指定は従来の bytes を再現する。v3 は note-recovery-readable-v3.cjs に凍結し、旧 claim のコード指紋を明示して確認する。新しい公開は v4 を既定とし、既存の有料本文・modelSubset 文法のまま v4 の receipt に記録する。新 renderer と無料説明 helper の双方を claim 復旧時に hash 検査する。版不明・原本不一致・改変 proof は従来どおり停止する。

検査対象は node --test scripts/note-free-explanation.test.cjs、既存の readable/publication/published-ticket-sections/korogashi/recovery/result-provenance/transport テスト。新しいアルゴリズム、予想再計算、過去原本や公開済み記事の自動修正は含まない。
