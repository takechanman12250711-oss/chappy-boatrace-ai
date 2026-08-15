"use strict";

const assert = require("node:assert/strict");
const ab = require("../js/scenario-likelihood-v5-ab");

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
  approvalGate: {
    approvedCandidates: [
      { approved: true, scope: "venue-scenario", key: "20:3攻め", action: "raise", adjustmentPoints: 5 },
      { approved: true, scope: "scenario", key: "1逃げ", action: "lower", adjustmentPoints: 3 }
    ]
  }
};

const result = ab.build(base, report, { jcd: "20" });
assert.equal(result.status, "shadow-only");
assert.equal(result.usableForPrediction, false);
assert.equal(result.automaticApplication, false);
assert.equal(result.changed, true);
assert.equal(result.a.leader.label, "1逃げ");
assert.equal(result.b.scenarios.reduce((sum, row) => sum + row.relativeLikelihood, 0), 100);
assert.ok(result.b.scenarios.find(row => row.label === "3攻め").relativeLikelihood > 15);
assert.ok(result.b.scenarios.find(row => row.label === "1逃げ").relativeLikelihood < 50);
assert.ok(result.b.scenarios.every(row => Math.abs(row.adjustmentPoints) <= 5));

const unchanged = ab.build(base, { approvalGate: { approvedCandidates: [] } }, { jcd: "20" });
assert.equal(unchanged.changed, false);
assert.deepEqual(
  unchanged.a.scenarios.map(row => row.relativeLikelihood),
  unchanged.b.scenarios.map(row => row.relativeLikelihood)
);

const historicalDecisionDoesNotDisableUpgradeCollection = ab.build(base, {
  abDecision: {
    status: "rejected",
    active: false,
    decision: "keep-production-a",
    reason: "previous candidate generation rejected"
  },
  approvalGate: report.approvalGate
}, { jcd: "20" });
assert.equal(historicalDecisionDoesNotDisableUpgradeCollection.status, "shadow-only");
assert.equal(historicalDecisionDoesNotDisableUpgradeCollection.changed, true);
assert.equal(historicalDecisionDoesNotDisableUpgradeCollection.candidateCount, 2);
assert.ok(historicalDecisionDoesNotDisableUpgradeCollection.a);
assert.ok(historicalDecisionDoesNotDisableUpgradeCollection.b);
assert.equal(historicalDecisionDoesNotDisableUpgradeCollection.usableForPrediction, false);
assert.equal(historicalDecisionDoesNotDisableUpgradeCollection.automaticApplication, false);

console.log("scenario likelihood v5 shadow A/B tests passed");
