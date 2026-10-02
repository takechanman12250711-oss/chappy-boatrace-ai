"use strict";
const assert = require("node:assert/strict");
const phase8 = require("../js/theory-profit-review-phase8");
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

const integratedPhase8 = phase8.build({
  byTheory: [{
    theoryKey: "exhibition",
    label: "展示・足理論",
    evaluatedCount: 215,
    recoveryRate: 64.4,
    practicalHitRate: 18.6,
    skipDecisionAccuracy: null,
    hitRate: 15.8
  }]
}, {
  selectedTheory: { theoryKey: "exhibition" }
});
const integratedReport = phase9.build(integratedPhase8);
assert.equal(integratedPhase8.status, "review-candidate-ready");
assert.equal(integratedPhase8.candidate.ready, true);
assert.equal(integratedReport.status, "proposal-ready", "実際のPhase8出力をPhase9が受理する");
assert.equal(integratedReport.proposalCount, 1);
assert.equal(integratedReport.proposal.theoryKey, "exhibition");
assert.equal(integratedReport.proposal.approved, false, "改善提案は人の承認前にA/Bへ進めない");
assert.equal(integratedReport.automaticApplication, false);
assert.equal(integratedReport.usableForPrediction, false);
console.log("theory improvement proposal phase9 tests passed");
