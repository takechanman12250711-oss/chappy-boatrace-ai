"use strict";
const fs = require("node:fs");

const practicalFile = "js/practical-selection.js";
let practical = fs.readFileSync(practicalFile, "utf8");
const anchor = "    const candidateOutcomesByTicket =\n      new Map();\n";
const inserted = `    if (\n      strongEscapeTrim.applied &&\n      selected.length < MAXIMUM_COUNT\n    ) {\n      candidateDecisions.forEach(\n        decision => {\n          if (\n            decision.selected !== true &&\n            decision.reasonCode ===\n              \"MAXIMUM_REACHED\"\n          ) {\n            decision.reasonCode =\n              \"STRONG_ESCAPE_POST_TRIM_NOT_REFILLED\";\n            decision.reason =\n              \"強い1逃げの別頭整理後は空き枠を再充填せず、整理前の選抜順位を維持して候補に保持。\";\n          }\n        }\n      );\n    }\n\n${anchor}`;
if (!practical.includes("STRONG_ESCAPE_POST_TRIM_NOT_REFILLED")) {
  if (!practical.includes(anchor)) throw new Error("missing candidate outcomes anchor");
  practical = practical.replace(anchor, inserted);
}
fs.writeFileSync(practicalFile, practical);

const consistencyFile = "scripts/test-evaluated-scenario-consistency.js";
let consistency = fs.readFileSync(consistencyFile, "utf8");
const oldHash = "88855158a9eed5ee63f9381425a818c24fe5ad1e607b2f7852c9d9b7444c0373";
const newHash = "03b24fda4aa4226a6e4283b86ac9655dbc5caf378de738d4ca53908ca2218c63";
if (consistency.includes(oldHash)) {
  consistency = consistency.replace(oldHash, newHash);
} else if (!consistency.includes(newHash)) {
  throw new Error("missing selection snapshot hash anchor");
}
fs.writeFileSync(consistencyFile, consistency);
console.log("strong escape audit reasons and selection snapshot finalized");
