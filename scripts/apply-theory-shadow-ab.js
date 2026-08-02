"use strict";
const fs = require("node:fs");
const path = require("node:path");
const filePath = path.join(__dirname, "collect-predictions.js");
let source = fs.readFileSync(filePath, "utf8");

function replaceOnce(before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 match, found ${count}`);
  source = source.replace(before, after);
}

replaceOnce(
`const theoryTagSnapshot = require(\n  "../js/theory-tag-snapshot"\n);\n`,
`const theoryTagSnapshot = require(\n  "../js/theory-tag-snapshot"\n);\nconst theoryShadowAb = require(\n  "../js/theory-shadow-ab"\n);\nconst theoryImprovementReport =\n  loadOptionalV2Dependency(\n    () => require(\n      "../data/stats/theory-improvement-proposals.json"\n    ),\n    { approvalGate: { approvedCandidates: [] } },\n    "理論改善承認候補"\n  );\n`,
"require theory shadow A/B"
);

replaceOnce(
`  const selection =\n    buildActiveV2Selection(\n      shadowV2,\n      legacySelection,\n      selected\n    );\n`,
`  const theorySnapshot =\n    theoryTagSnapshot.build(\n      prediction,\n      practicalTickets\n    );\n  const theoryShadowComparison =\n    theoryShadowAb.build(\n      theorySnapshot,\n      theoryImprovementReport,\n      { jcd: item.jcd }\n    );\n  const selection =\n    buildActiveV2Selection(\n      shadowV2,\n      legacySelection,\n      selected\n    );\n`,
"build theory shadow A/B"
);

replaceOnce(
`    theoryTagSnapshot:\n      theoryTagSnapshot.build(\n        prediction,\n        practicalTickets\n      ),\n`,
`    theoryTagSnapshot:\n      theorySnapshot,\n    theoryShadowAb:\n      theoryShadowComparison,\n`,
"store theory shadow A/B"
);

fs.writeFileSync(filePath, source, "utf8");
console.log("theory shadow A/B patch applied");
