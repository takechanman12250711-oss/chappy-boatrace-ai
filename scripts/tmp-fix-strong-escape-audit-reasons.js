"use strict";
const fs = require("node:fs");
const file = "js/practical-selection.js";
let source = fs.readFileSync(file, "utf8");
const anchor = "    const candidateOutcomesByTicket =\n      new Map();\n";
const inserted = `    if (\n      strongEscapeTrim.applied &&\n      selected.length < MAXIMUM_COUNT\n    ) {\n      candidateDecisions.forEach(\n        decision => {\n          if (\n            decision.selected !== true &&\n            decision.reasonCode ===\n              \"MAXIMUM_REACHED\"\n          ) {\n            decision.reasonCode =\n              \"STRONG_ESCAPE_POST_TRIM_NOT_REFILLED\";\n            decision.reason =\n              \"強い1逃げの別頭整理後は空き枠を再充填せず、整理前の選抜順位を維持して候補に保持。\";\n          }\n        }\n      );\n    }\n\n${anchor}`;
if (!source.includes("STRONG_ESCAPE_POST_TRIM_NOT_REFILLED")) {
  if (!source.includes(anchor)) throw new Error("missing candidate outcomes anchor");
  source = source.replace(anchor, inserted);
}
fs.writeFileSync(file, source);
console.log("strong escape audit reasons fixed");
