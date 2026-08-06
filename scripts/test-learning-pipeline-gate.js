"use strict";

const assert = require("node:assert/strict");
const gate = require("../js/learning-pipeline-gate");
const builder = require("./build-learning-pipeline-gate");

const records = Array.from({ length: 100 }, (_, index) => ({
  raceKey: `race-${index + 1}`,
  result: {
    settled: true,
    missCauseAnalysis: { status: "candidates-recorded" }
  },
  theoryEvaluationSnapshot: { status: "evaluated" }
}));

const safeProposal = {
  status: "proposal-candidates-ready",
  proposalCount: 3,
  proposalOnly: true,
  humanApprovalRequired: true,
  usableForPrediction: false,
  automaticApplication: false,
  uiVisible: false
};

const ready = gate.build(records, safeProposal);
assert.equal(ready.status, "awaiting-human-approval");
assert.equal(ready.pipelineComplete, true);
assert.equal(ready.approvalGranted, false);
assert.equal(ready.automaticApplication, false);
assert.equal(ready.usableForPrediction, false);
assert.equal(ready.uiVisible, false);
assert.equal(ready.pipelineCoverage.theoryEvaluation, 100);
assert.equal(ready.pipelineCoverage.missCauseAnalysis, 100);

const incomplete = gate.build(records.slice(0, 99).concat([{ result: { settled: true } }]), safeProposal);
assert.equal(incomplete.status, "blocked-incomplete-pipeline");

const unsafe = gate.build(records, { ...safeProposal, automaticApplication: true });
assert.equal(unsafe.status, "blocked-safety-violation");
assert(unsafe.safetyViolations.includes("automatic-application-enabled"));

const collecting = gate.build(records, { ...safeProposal, status: "collecting-data", proposalCount: 0 });
assert.equal(collecting.status, "collecting-data");

const primary = { raceKey: "same-race", source: "primary" };
const duplicateVerification = { raceKey: "same-race", source: "verification" };
const verificationOnly = { raceKey: "verification-only", source: "verification" };
const merged = builder.mergePredictionSources({
  predictions: [primary],
  verificationPredictions: [duplicateVerification, verificationOnly]
});
assert.equal(merged.length, 2);
assert.equal(merged.find(row => row.raceKey === "same-race").source, "primary");
assert.equal(merged.some(row => row.raceKey === "verification-only"), true);

console.log("学習パイプライン統合ゲート Phase4: 合格");
