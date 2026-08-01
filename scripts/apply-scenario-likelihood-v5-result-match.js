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
`const boatIdentity = require(\n  "../js/boat-identity"\n);\n`,
`const boatIdentity = require(\n  "../js/boat-identity"\n);\nconst scenarioLikelihoodV5Verification = require(\n  "../js/scenario-likelihood-v5-verification"\n);\n`,
"require scenario likelihood verification"
);

replaceOnce(
`    honmeiFirst: Boolean(honmeiBoat && resultTicket.split("-")[0] === honmeiBoat),\n    verification: detail\n`,
`    honmeiFirst: Boolean(honmeiBoat && resultTicket.split("-")[0] === honmeiBoat),\n    scenarioLikelihoodV5Verification:\n      scenarioLikelihoodV5Verification.verify(\n        prediction?.scenarioLikelihoodV5,\n        result\n      ),\n    verification: detail\n`,
"attach scenario likelihood verification"
);

replaceOnce(
`  const verificationSummary = verification.buildSummary(\n    settled.map(item => item.result?.verification || item.result)\n  );\n`,
`  const verificationSummary = verification.buildSummary(\n    settled.map(item => item.result?.verification || item.result)\n  );\n  const scenarioLikelihoodV5Summary =\n    scenarioLikelihoodV5Verification.buildSummary(\n      settled.map(item =>\n        item?.result?.scenarioLikelihoodV5Verification\n      )\n    );\n`,
"build scenario likelihood summary"
);

replaceOnce(
`    priorityStageSummary: verificationSummary.priorityStageSummary\n`,
`    priorityStageSummary: verificationSummary.priorityStageSummary,\n    scenarioLikelihoodV5Summary\n`,
"store scenario likelihood summary"
);

fs.writeFileSync(filePath, source, "utf8");
console.log("scenario likelihood v5 result matching patch applied");
