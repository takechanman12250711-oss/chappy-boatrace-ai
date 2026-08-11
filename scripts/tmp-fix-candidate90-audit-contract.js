"use strict";
const fs=require("node:fs");

function patch(file, from, to) {
  let s=fs.readFileSync(file,"utf8");
  if(!s.includes(from)) throw new Error(`anchor not found in ${file}`);
  s=s.replace(from,to);
  fs.writeFileSync(file,s);
}

patch(
  "js/practical-selection.js",
`        const promoted = {\n          ...row,\n          coverage: [\n            ...arrayify(\n              row.physicalCoverage\n            )\n          ],\n          category: "候補補完",`,
`        const promoted = {\n          ...row,\n          category: "候補補完",`
);

patch(
  "scripts/test-evaluated-scenario-consistency.js",
`  "独立展開": "independent"\n};`,
`  "独立展開": "independent",\n  "候補補完": "candidate-promotion"\n};`
);

patch(
  "scripts/test-evaluated-scenario-consistency.js",
`      if (\n        item.selectionTier !==\n        "展開追加"\n      ) {\n        assert.ok(\n          baseBranches.every(\n            (branch) =>\n              baseFormationGroup(\n                branch.source\n              ) === group\n          ),\n          \`${'${raceKey}'}: ${'${item.ticket}'}の${'${item.category}'}表示へ別カテゴリ枝を混ぜない \` +\n          \`(sourceCategory=${'${item.sourceCategory || ""}'}, \` +\n          \`selectionTier=${'${item.selectionTier || ""}'}, \` +\n          \`sources=${'${baseBranches.map((branch) => branch.source).join(",")}'})\`\n        );\n      } else {`,
`      if (\n        item.selectionTier ===\n          "候補補完"\n      ) {\n        assert.equal(\n          group,\n          "candidate-promotion",\n          \`${'${raceKey}'}: 候補補完を専用カテゴリとして監査する\`\n        );\n        assert.equal(\n          item.candidatePromotion,\n          true,\n          \`${'${raceKey}'}: 候補補完フラグを明示する\`\n        );\n        assert.equal(\n          Number(item.candidatePromotionThreshold),\n          90,\n          \`${'${raceKey}'}: 候補補完閾値を90に固定する\`\n        );\n        assert.ok(\n          Number(item.priorityScore || 0) >= 90,\n          \`${'${raceKey}'}: 候補補完をpriority 90以上に限定する\`\n        );\n        const physicalPositions = new Set(\n          arrayify(item.physicalCoverage)\n            .map(claim => Number(claim?.position || 0))\n            .filter(position => position >= 1 && position <= 3)\n        );\n        assert.equal(\n          physicalPositions.size,\n          3,\n          \`${'${raceKey}'}: 候補補完は1〜3着すべての物理根拠を必須にする\`\n        );\n      } else if (\n        item.selectionTier !==\n        "展開追加"\n      ) {\n        assert.ok(\n          baseBranches.every(\n            (branch) =>\n              baseFormationGroup(\n                branch.source\n              ) === group\n          ),\n          \`${'${raceKey}'}: ${'${item.ticket}'}の${'${item.category}'}表示へ別カテゴリ枝を混ぜない \` +\n          \`(sourceCategory=${'${item.sourceCategory || ""}'}, \` +\n          \`selectionTier=${'${item.selectionTier || ""}'}, \` +\n          \`sources=${'${baseBranches.map((branch) => branch.source).join(",")}'})\`\n        );\n      } else {`
);

patch(
  "scripts/test-evaluated-scenario-consistency.js",
`    assert.ok(\n      practical.tickets.every(\n        (item) =>\n          item.evidenceQualified === true &&\n          (\n            item.validBranchIds ||\n            []\n          ).length > 0\n      ),\n      \`${'${raceKey}'}: 全購入買い目を実在する構造化枝へ接続する \` +`,
`    assert.ok(\n      practical.tickets.every(\n        (item) =>\n          (\n            item.evidenceQualified === true &&\n            (\n              item.validBranchIds ||\n              []\n            ).length > 0\n          ) ||\n          (\n            item.selectionTier === "候補補完" &&\n            item.candidatePromotion === true &&\n            Number(item.priorityScore || 0) >= 90 &&\n            new Set(\n              arrayify(item.physicalCoverage)\n                .map(claim => Number(claim?.position || 0))\n                .filter(position => position >= 1 && position <= 3)\n            ).size === 3\n          )\n      ),\n      \`${'${raceKey}'}: 全購入買い目を構造化枝または承認済み候補補完条件へ接続する \` +`
);

console.log("candidate90 audit contract patched");
