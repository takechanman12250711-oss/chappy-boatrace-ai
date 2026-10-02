"use strict";

const assert = require("node:assert/strict");
const handoff = require("./build-phase3-learning-handoff");

const policyCompatibility = {
  reviewed: true,
  preserveRealisticSecondCourseSashi: true,
  preserveRealisticFourthBoatHold: true,
  preserveEvaluatedScenarioCandidatesForEveryBoat: true,
  candidateGenerationPrecedesTicketLimit: true,
  excludedCandidatesRequireStructuredReason: true,
  numbersAloneMayDeleteTickets: false,
};
const policyReviewReport = {
  items: {
    a: { facts: policyCompatibility, reviewed: true, reasons: [] },
    b: {
      reviewed: true,
      facts: {
        ...policyCompatibility,
        preserveEvaluatedScenarioCandidatesForEveryBoat: false,
      },
      reasons: ["候補群を保持しない"],
    },
  },
};
const candidate = {
  id: "a",
  file: "a.json",
  status: "available",
  decision: "candidate",
  affectedSettledCount: 30,
  minimumAffectedSettledCount: 30,
  aRecoveryRate: 70,
  bRecoveryRate: 90,
  aProfit: -100,
  bProfit: 200,
};
const historical = {
  settledRaceCount: 1450,
  proposals: [{
    code: "flow-reading-miss",
    label: "展開読み違い",
    theory: "展開理論",
    sampleCount: 860,
    occurrenceRate: 59.3,
    priority: "high",
    improvementCandidate: "展開成立条件と崩れ条件の再検証",
    expectedEffect: "展開一致率の改善余地を検証",
  }],
  outcomeDiagnostics: [{
    code: "ticket-coverage-insufficient",
    label: "買い目不足",
    theory: "買い目構成",
    sampleCount: 1127,
    occurrenceRate: 77.7,
    priority: "high",
    diagnosticOnly: true,
    rootCauseCandidate: false,
  }],
};

let report = handoff.build({
  allSourcesConnected: true,
  items: [
    { ...candidate, policyCompatibility },
    { id: "b", file: "b.json", status: "available", decision: "candidate" },
    { id: "c", status: "available", decision: "continue" },
  ],
}, historical, policyReviewReport);
assert.equal(report.implementationComplete, true);
assert.equal(report.schemaVersion, 6);
assert.equal(report.historicalEvidence.settledRaceCount, 1450);
assert.equal(report.historicalEvidence.proposalCount, 1);
assert.equal(report.historicalEvidence.proposals[0].sampleCount, 860);
assert.equal(report.historicalEvidence.diagnosticCount, 1);
assert.equal(report.historicalEvidence.diagnostics[0].sampleCount, 1127);
assert.equal(report.historicalEvidence.diagnostics[0].diagnosticOnly, true);
assert.equal(report.historicalEvidence.diagnostics[0].rootCauseCandidate, false);
assert.equal(report.statisticalCandidateCount, 2);
assert.equal(report.candidateCount, 1);
assert.equal(report.candidates[0].status, "awaiting-user-approval");
assert.equal(report.candidates[0].approved, false);
assert.equal(report.candidates[0].productionApplied, false);
assert.equal(report.policyReviewCount, 0);
assert.equal(report.policyRejectedCount, 1);
assert.equal(report.policyRejected[0].status, "rejected-policy-incompatible");
assert.deepEqual(report.policyRejected[0].failedRequirements, [
  "preserveEvaluatedScenarioCandidatesForEveryBoat",
]);
assert.equal(report.policyRejected[0].reason, "候補群を保持しない");
assert.equal(report.rejectedCount, 0);
assert.equal(report.automaticApplication, false);
assert.equal(report.usableForPrediction, false);
assert.equal(report.productionChanged, false);
assert.equal(report.nextStep, "user-approval");

report = handoff.build({ allSourcesConnected: true, items: [candidate] }, historical);
assert.equal(report.candidateCount, 0);
assert.equal(report.policyReviewCount, 1);
assert.equal(report.policyRejectedCount, 0);
assert.equal(report.nextStep, "policy-compatibility-review");

report = handoff.build({
  allSourcesConnected: true,
  items: [
    { id: "c", status: "available", decision: "continue" },
    {
      ...candidate,
      id: "frame-shadow-off",
      file: "frame-rise-fall-shadow-result-report.json",
      decision: "reject",
      reason: "固定件数評価で不採用",
    },
  ],
}, historical);
assert.equal(report.candidateCount, 0);
assert.equal(report.policyReviewCount, 0);
assert.equal(report.rejectedCount, 1);
assert.equal(report.rejected[0].id, "frame-shadow-off");
assert.equal(report.rejected[0].status, "rejected-by-ab-evidence");
assert.equal(report.rejected[0].reason, "固定件数評価で不採用");
assert.equal(report.rejected[0].approved, false);
assert.equal(report.rejected[0].productionApplied, false);
assert.equal(report.nextStep, "continue-validation-from-historical-evidence");
assert.equal(report.historicalEvidence.proposals[0].usableForPrediction, false);
assert.equal(report.historicalEvidence.diagnostics[0].usableForPrediction, false);

report = handoff.build({
  allSourcesConnected: true,
  items: [{ id: "c", status: "available", decision: "continue" }],
}, {});
assert.equal(report.nextStep, "collect-more-settled-races");
assert.throws(() => handoff.build({ allSourcesConnected: false, items: [] }, historical));
console.log("phase3 learning handoff test: ok");
