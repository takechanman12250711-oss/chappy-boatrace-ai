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
`const scenarioLikelihoodV5Calibration =\n  loadOptionalV2Dependency(\n    () => require(\n      "../data/stats/scenario-likelihood-v5-calibration.json"\n    ),\n    { approvalGate: { approvedCandidates: [] } },\n    "展開校正レポート"\n  );\n`,
`const scenarioLikelihoodV5Calibration =\n  loadOptionalV2Dependency(\n    () => require(\n      "../data/stats/scenario-likelihood-v5-calibration.json"\n    ),\n    { approvalGate: { approvedCandidates: [] } },\n    "展開校正レポート"\n  );\nconst theoryTagSnapshot = require(\n  "../js/theory-tag-snapshot"\n);\n`,
"require theory tag snapshot"
);

replaceOnce(
`    scenarioLikelihoodV5Ab:\n      scenarioLikelihoodAb,\n    prediction: compactVerificationPayload(\n`,
`    scenarioLikelihoodV5Ab:\n      scenarioLikelihoodAb,\n    theoryTagSnapshot:\n      theoryTagSnapshot.build(\n        prediction,\n        practicalTickets\n      ),\n    prediction: compactVerificationPayload(\n`,
"store theory tag snapshot"
);

fs.writeFileSync(filePath, source, "utf8");
console.log("theory tag snapshot patch applied");
