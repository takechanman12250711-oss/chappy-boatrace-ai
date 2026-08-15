"use strict";

const assert = require("node:assert/strict");
const policy = require("../config/upgrade-collection-policy.json");
const decision = require("../config/scenario-likelihood-v5-decision.json");
const ab = require("../js/scenario-likelihood-v5-ab");

assert.equal(policy.status, "active");
assert.equal(policy.rules.keepLearningAndAnalysisSystems, true);
assert.equal(policy.rules.keepShadowDataCollection, true);
assert.equal(policy.rules.rejectOnlyEvaluatedCandidateGeneration, true);
assert.equal(policy.rules.productionChangesRequireSeparateAdoptionDecision, true);
assert.equal(policy.rules.automaticApplication, false);
assert.equal(decision.status, "rejected");
assert.equal(decision.productionCandidate, false);

const base = {
  ambiguity: "lean",
  scenarios: [
    { key: "inEscape", label: "1逃げ", score: 80, relativeLikelihood: 50 },
    { key: "course2Sashi", label: "2差し", score: 70, relativeLikelihood: 30 },
    { key: "course3Attack", label: "3攻め", score: 60, relativeLikelihood: 15 },
    { key: "course4Kado", label: "4カド", score: 50, relativeLikelihood: 5 }
  ]
};
const report = {
  abDecision: decision,
  approvalGate: {
    approvedCandidates: [
      { approved: true, scope: "scenario", key: "1逃げ", action: "lower", adjustmentPoints: 3 }
    ]
  }
};
const shadow = ab.build(base, report, { jcd: "20" });
assert.equal(shadow.status, "shadow-only");
assert.equal(shadow.candidateCount, 1);
assert.equal(shadow.changed, true);
assert.equal(shadow.usableForPrediction, false);
assert.equal(shadow.automaticApplication, false);

console.log("upgrade collection policy tests passed");
