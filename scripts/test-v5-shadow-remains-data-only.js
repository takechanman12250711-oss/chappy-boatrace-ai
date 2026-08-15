"use strict";
const assert = require("node:assert/strict");
const ab = require("../js/scenario-likelihood-v5-ab");
const base = { ambiguity: "lean", scenarios: [
  { key: "inEscape", label: "1逃げ", relativeLikelihood: 50 },
  { key: "course2Sashi", label: "2差し", relativeLikelihood: 30 },
  { key: "course3Attack", label: "3攻め", relativeLikelihood: 15 },
  { key: "course4Kado", label: "4カド", relativeLikelihood: 5 }
]};
const result = ab.build(base, { approvalGate: { approvedCandidates: [] } }, { jcd: "24" });
assert.equal(result.status, "shadow-only");
assert.equal(result.usableForPrediction, false);
assert.equal(result.automaticApplication, false);
console.log("v5 upgrade shadow remains data-only");
