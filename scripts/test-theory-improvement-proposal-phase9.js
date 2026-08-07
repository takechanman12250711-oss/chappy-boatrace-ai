"use strict";
const assert = require("node:assert/strict");
const phase9 = require("../js/theory-improvement-proposal-phase9");

let report = phase9.build({
  status: "collecting-data",
  priorityOrder: ["recoveryRate", "practicalHitRate", "skipDecisionAccuracy", "hitRate"],
  candidate: null
});
assert.equal(report.status, "waiting-for-phase8-candidate");
assert.equal(report.proposalCount, 0);
assert.equal(report.automaticApplication, false);
assert.equal(report.usableForPrediction, false);

report = phase9.build({
  status: "candidate-ready",
  priorityOrder: ["recoveryRate", "practicalHitRate", "skipDecisionAccuracy", "hitRate"],
  candidate: {
    theoryKey: "race-flow",
    label: "展開理論",
    evidenceCount: 31,
    ready: true,
    metrics: { recoveryRate: 42.5, practicalHitRate: 21.0, skipDecisionAccuracy: null, hitRate: 18.0 },
    metricStatuses: { recoveryRate: "weak", practicalHitRate: "strong", skipDecisionAccuracy: "missing", hitRate: "strong" }
  }
});
assert.equal(report.status, "proposal-ready");
assert.equal(report.proposalCount, 1);
assert.equal(report.proposal.focusMetric, "recoveryRate");
assert.equal(report.proposal.currentValue, 42.5);
assert.equal(report.proposal.humanApprovalRequired, true);
assert.equal(report.proposal.approved, false);
assert.equal(report.proposal.automaticApplication, false);
assert.equal(report.proposal.usableForPrediction, false);
assert.equal(report.oneProposalOnly, true);
console.log("theory improvement proposal phase9 tests passed");
