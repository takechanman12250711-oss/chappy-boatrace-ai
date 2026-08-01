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
`const scenarioLikelihoodV5 =\n  loadOptionalV2Dependency(\n    () => require(\n      "../js/scenario-likelihood-v5"\n    ),\n    null,\n    "展開相対成立度"\n  );\n`,
`const scenarioLikelihoodV5 =\n  loadOptionalV2Dependency(\n    () => require(\n      "../js/scenario-likelihood-v5"\n    ),\n    null,\n    "展開相対成立度"\n  );\nconst scenarioLikelihoodV5Ab =\n  loadOptionalV2Dependency(\n    () => require(\n      "../js/scenario-likelihood-v5-ab"\n    ),\n    null,\n    "展開A/B比較"\n  );\nconst scenarioLikelihoodV5Calibration =\n  loadOptionalV2Dependency(\n    () => require(\n      "../data/stats/scenario-likelihood-v5-calibration.json"\n    ),\n    { approvalGate: { approvedCandidates: [] } },\n    "展開校正レポート"\n  );\n`,
"load A/B dependencies"
);

replaceOnce(
`  "js/scenario-likelihood-v5.js"\n], "ロジック");`,
`  "js/scenario-likelihood-v5.js",\n  "js/scenario-likelihood-v5-ab.js"\n], "ロジック");`,
"fingerprint A/B engine"
);

replaceOnce(
`  const selection =\n    buildActiveV2Selection(\n      shadowV2,\n      legacySelection,\n      selected\n    );`,
`  const scenarioLikelihoodAb =\n    typeof scenarioLikelihoodV5Ab?.build === "function"\n      ? scenarioLikelihoodV5Ab.build(\n          scenarioLikelihood,\n          scenarioLikelihoodV5Calibration,\n          { jcd: item.jcd }\n        )\n      : {\n          status: "unavailable",\n          usableForPrediction: false,\n          automaticApplication: false,\n          a: null,\n          b: null\n        };\n  const selection =\n    buildActiveV2Selection(\n      shadowV2,\n      legacySelection,\n      selected\n    );`,
"build A/B snapshot"
);

replaceOnce(
`    scenarioLikelihoodV5:\n      scenarioLikelihood,\n    prediction: compactVerificationPayload(`,
`    scenarioLikelihoodV5:\n      scenarioLikelihood,\n    scenarioLikelihoodV5Ab:\n      scenarioLikelihoodAb,\n    prediction: compactVerificationPayload(`,
"store A/B snapshot"
);

fs.writeFileSync(filePath, source, "utf8");
console.log("scenario likelihood v5 A/B storage patch applied");
