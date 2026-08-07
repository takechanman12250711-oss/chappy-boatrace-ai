"use strict";
const assert = require("node:assert/strict");
const phase10 = require("../js/theory-ab-phase10");

let report = phase10.build({
  status: "waiting-for-phase8-candidate",
  proposalCount: 0,
  proposal: null
});
assert.equal(report.status, "waiting-for-approved-phase9-proposal");
assert.equal(report.candidateB, null);
assert.equal(report.automaticApplication, false);
assert.equal(report.usableForPrediction, false);
assert.equal(report.baselineA.immutable, true);

report = phase10.build({
  status: "proposal-ready",
  proposalCount: 1,
  proposal: {
    theoryKey: "race-flow",
    label: "展開理論",
    focusMetric: "recoveryRate",
    changeCandidate: "弱い枝だけA/B検証",
    rationale: "正式証拠30Rを根拠に検証",
    expectedEffect: "回収率改善余地を検証",
    approved: false
  }
});
assert.equal(report.status, "waiting-for-approved-phase9-proposal");
assert.equal(report.candidateB, null, "未承認提案からBを作らない");

report = phase10.build({
  status: "proposal-ready",
  proposalCount: 1,
  proposal: {
    theoryKey: "race-flow",
    label: "展開理論",
    focusMetric: "recoveryRate",
    changeCandidate: "弱い枝だけA/B検証",
    rationale: "正式証拠30Rを根拠に検証",
    expectedEffect: "回収率改善余地を検証",
    approved: true
  }
});
assert.equal(report.status, "ready-for-shadow-ab");
assert.equal(report.proposalApproved, true);
assert.equal(report.candidateB.shadowOnly, true);
assert.equal(report.candidateB.productionPrediction, false);
assert.equal(report.candidateB.productionPurchaseSelection, false);
assert.equal(report.comparison.minimumComparableRaces, 50);
assert.deepEqual(report.metricOrder, ["recoveryRate", "practicalHitRate", "skipDecisionAccuracy", "hitRate"]);
assert.equal(report.comparison.automaticWinnerSelection, false);
assert.equal(report.automaticApplication, false);
assert.equal(report.usableForPrediction, false);
console.log("Phase10 theory A/B foundation tests passed");
