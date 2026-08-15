"use strict";

const assert = require("node:assert/strict");
const decision = require("../config/scenario-likelihood-v5-decision.json");
const history = require("../config/scenario-likelihood-v5-decision-history.json");
const policy = require("../config/upgrade-collection-policy.json");
const ab = require("../js/scenario-likelihood-v5-ab");

const base = {
  ambiguity: "clear",
  scenarios: [
    { key: "inEscape", label: "1逃げ", score: 80, relativeLikelihood: 55 },
    { key: "course2Sashi", label: "2差し", score: 70, relativeLikelihood: 25 },
    { key: "course3Attack", label: "3攻め", score: 60, relativeLikelihood: 15 },
    { key: "course4Kado", label: "4カド", score: 50, relativeLikelihood: 5 }
  ]
};
const calibration = {
  abDecision: decision,
  approvalGate: {
    approvedCandidates: [
      { approved: true, scope: "scenario", key: "1逃げ", action: "lower", adjustmentPoints: 5 },
      { approved: true, scope: "ambiguity", key: "clear", action: "lower", adjustmentPoints: 5 }
    ]
  }
};
const next = ab.build(base, calibration, { jcd: "24" });
assert.equal(decision.status, "rejected");
assert.equal(history.collectionSystemStatus, "active");
assert.equal(policy.rules.keepShadowDataCollection, true);
assert.equal(next.status, "shadow-only");
assert.equal(next.changed, true);
assert.equal(next.candidateCount, 2);
assert.equal(next.usableForPrediction, false);
assert.equal(next.automaticApplication, false);
console.log("v5 upgrade collection regression tests passed");
