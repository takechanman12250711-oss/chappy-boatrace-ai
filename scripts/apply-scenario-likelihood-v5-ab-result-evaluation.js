"use strict";

const fs = require("node:fs");
const path = require("node:path");
const filePath = path.join(__dirname, "match-predictions.js");
let source = fs.readFileSync(filePath, "utf8");

function replaceOnce(before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 match, found ${count}`);
  source = source.replace(before, after);
}

replaceOnce(
`const scenarioLikelihoodV5Verification = require(\n  "../js/scenario-likelihood-v5-verification"\n);\n`,
`const scenarioLikelihoodV5Verification = require(\n  "../js/scenario-likelihood-v5-verification"\n);\nconst scenarioLikelihoodV5AbVerification = require(\n  "../js/scenario-likelihood-v5-ab-verification"\n);\n`,
"require A/B verification"
);

replaceOnce(
`    scenarioLikelihoodV5Verification:\n      scenarioLikelihoodV5Verification.verify(\n        prediction?.scenarioLikelihoodV5,\n        result\n      ),\n    verification: detail\n`,
`    scenarioLikelihoodV5Verification:\n      scenarioLikelihoodV5Verification.verify(\n        prediction?.scenarioLikelihoodV5,\n        result\n      ),\n    scenarioLikelihoodV5AbVerification:\n      scenarioLikelihoodV5AbVerification.verify(\n        prediction?.scenarioLikelihoodV5Ab,\n        result\n      ),\n    verification: detail\n`,
"attach A/B verification"
);

replaceOnce(
`  const scenarioLikelihoodV5Summary =\n    scenarioLikelihoodV5Verification.buildSummary(\n      settled.map(item =>\n        item?.result?.scenarioLikelihoodV5Verification\n      )\n    );\n`,
`  const scenarioLikelihoodV5Summary =\n    scenarioLikelihoodV5Verification.buildSummary(\n      settled.map(item =>\n        item?.result?.scenarioLikelihoodV5Verification\n      )\n    );\n  const scenarioLikelihoodV5AbSummary =\n    scenarioLikelihoodV5AbVerification.buildSummary(\n      settled.map(item => ({\n        ...(item?.result?.scenarioLikelihoodV5AbVerification || {}),\n        jcd: item?.jcd\n      }))\n    );\n`,
"build A/B summary"
);

replaceOnce(
`    scenarioLikelihoodV5Summary\n`,
`    scenarioLikelihoodV5Summary,\n    scenarioLikelihoodV5AbSummary\n`,
"store A/B summary"
);

fs.writeFileSync(filePath, source, "utf8");
console.log("scenario likelihood v5 A/B result evaluation patch applied");
