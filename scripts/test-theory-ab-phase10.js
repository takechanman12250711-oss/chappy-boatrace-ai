"use strict";

const assert = require("node:assert/strict");
const phase10 = require("../js/theory-ab-phase10");
const candidateBranch = require("../js/theory-candidate-branch-analysis-phase9");

function phase9(approved) {
  return {
    status: "proposal-ready",
    proposalCount: 1,
    proposal: {
      theoryKey: "frame-rise-fall",
      label: "枠別浮沈率",
      evidenceCount: 117,
      focusMetric: "recoveryRate",
      currentValue: 50.8,
      changeCandidate: "低回収の成立条件を分解し、利益を落としている枝だけをA/B検証候補にする",
      rationale: "正式証拠117Rを根拠に検証",
      expectedEffect: "回収率改善余地を検証",
      approved
    }
  };
}

const proposalFingerprint = candidateBranch.proposalFingerprint(phase9(false).proposal);
const baseCandidate = candidateBranch.candidateDefinition(proposalFingerprint);
const baseAnalysis = {
  status: "candidate-ready-for-human-review",
  targetTheoryKey: "frame-rise-fall",
  phase9ProposalFingerprint: proposalFingerprint,
  candidateCount: 1,
  candidate: baseCandidate
};

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
assert.equal(report.readinessChecks.shadowImplementationVerifierPresent, true);

report = phase10.build(phase9(false), baseAnalysis);
assert.equal(report.status, "waiting-for-approved-phase9-proposal");
assert.equal(report.readinessChecks.shadowImplementationPresent, true);
assert.equal(report.readinessChecks.shadowImplementationVerified, true);
assert.equal(report.candidateB, null, "実装済みでも未承認提案からBを作らない");

report = phase10.build(phase9(true), baseAnalysis);
assert.equal(report.status, "waiting-for-approved-candidate-specification");
assert.equal(report.candidateB, null, "Phase9承認だけではBを作らない");

const frozenCandidate = structuredClone(baseCandidate);
frozenCandidate.prospectiveProtocol.cutoff = {
  selectedAtExclusiveLowerBound: "2026-08-15T00:00:00+09:00",
  sourceCommit: "d".repeat(40),
  logicFingerprint: `sha256:${"e".repeat(64)}`,
  status: "frozen"
};
frozenCandidate.candidateSpecFingerprint = candidateBranch.candidateSpecFingerprint(frozenCandidate);
frozenCandidate.approved = true;
frozenCandidate.approvedSpecFingerprint = frozenCandidate.candidateSpecFingerprint;

const approvedAnalysis = {
  ...baseAnalysis,
  candidate: frozenCandidate
};
report = phase10.build(phase9(true), approvedAnalysis);
assert.equal(report.status, "ready-for-shadow-ab");
assert.equal(report.readinessChecks.cutoffFrozen, true);
assert.equal(report.readinessChecks.shadowImplementationVerifierPresent, true);
assert.equal(report.readinessChecks.shadowImplementationVerified, true);
assert.equal(report.readinessChecks.shadowImplementationPresent, true);
assert.equal(report.readinessChecks.implementationCandidateSpecMatches, true);
assert.equal(report.readinessChecks.allPassed, true);
assert.equal(report.candidateB.candidateId, "frame-rise-fall-shadow-off-v1");
assert.equal(report.candidateB.proposedChange.effectiveValue, 0);
assert.equal(report.candidateB.shadowOnly, true);
assert.equal(report.candidateB.productionPrediction, false);
assert.equal(report.candidateB.productionPurchaseSelection, false);
assert.equal(report.comparison.minimumComparableRaces, 100);
assert.equal(report.comparison.automaticWinnerSelection, false);
assert.equal(report.automaticApplication, false);
assert.equal(report.usableForPrediction, false);

const tampered = structuredClone(approvedAnalysis);
tampered.candidate.proposedChange.effectiveValue = 999;
report = phase10.build(phase9(true), tampered);
assert.equal(report.status, "waiting-for-approved-candidate-specification");
assert.equal(report.readinessChecks.validCandidateSpecFingerprint, false);
assert.equal(report.readinessChecks.shadowImplementationVerified, false);
assert.equal(report.candidateB, null, "仕様改変はfingerprintとverifierの両方で拒否する");

console.log("Phase10 theory A/B shadow verifier tests passed");
