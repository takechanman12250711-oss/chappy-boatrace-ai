"use strict";
const assert = require("node:assert/strict");
const phase10 = require("../js/theory-ab-phase10");
const candidateBranch = require("../js/theory-candidate-branch-analysis-phase9");

function proposal(approved) {
  return {
    status: "proposal-ready",
    proposalCount: 1,
    proposal: {
      theoryKey: "race-flow",
      label: "展開理論",
      focusMetric: "recoveryRate",
      changeCandidate: "弱い枝だけA/B検証",
      rationale: "正式証拠30Rを根拠に検証",
      expectedEffect: "回収率改善余地を検証",
      approved
    }
  };
}

const proposalFingerprint = candidateBranch.proposalFingerprint(proposal(false).proposal);
const candidateSpecification = {
  candidateId: "race-flow-shadow-off-v1",
  label: "展開補正OFF",
  applicability: { all: [{ field: "formal", operator: "equals", value: true }] },
  proposedChange: { scope: "shadow-B-only", action: "disable-adjustment" },
  prospectiveProtocol: { fixedComparableRaces: 100 }
};
const candidateSpecFingerprint = candidateBranch.candidateSpecFingerprint(candidateSpecification);
const candidateAnalysis = {
  status: "candidate-ready-for-human-review",
  targetTheoryKey: "race-flow",
  phase9ProposalFingerprint: proposalFingerprint,
  candidateCount: 1,
  candidate: {
    ...candidateSpecification,
    candidateSpecFingerprint,
    sourceProposalFingerprint: proposalFingerprint,
    approved: false,
    approvedSpecFingerprint: null
  }
};
const forgedImplementationManifest = {
  status: "verified",
  implementationPresent: true,
  candidateId: candidateSpecification.candidateId,
  candidateSpecFingerprint,
  sourceCommit: "b".repeat(40),
  logicFingerprint: `sha256:${"c".repeat(64)}`
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

report = phase10.build(proposal(false), candidateAnalysis);
assert.equal(report.status, "waiting-for-approved-phase9-proposal");
assert.equal(report.candidateB, null, "未承認Phase9提案からBを作らない");

report = phase10.build(proposal(true), candidateAnalysis);
assert.equal(report.status, "waiting-for-approved-candidate-specification");
assert.equal(report.proposalApproved, true);
assert.equal(report.candidateB, null, "Phase9の文言承認だけではBを作らない");

report = phase10.build({
  ...proposal(true),
  proposal: { ...proposal(true).proposal, currentValue: 99 }
}, candidateAnalysis);
assert.equal(report.status, "waiting-for-approved-candidate-specification");
assert.equal(report.readinessChecks.proposalFingerprintMatches, false);
assert.equal(report.candidateB, null, "候補作成後にPhase9提案が変われば再承認を要求する");

report = phase10.build(proposal(true), {
  ...candidateAnalysis,
  candidate: {
    ...candidateAnalysis.candidate,
    approved: true,
    approvedSpecFingerprint: candidateSpecFingerprint
  }
});
assert.equal(report.status, "waiting-for-frozen-prospective-cutoff");
assert.equal(report.candidateB, null, "cutoff固定前はBを作らない");

const frozenCandidateSpecification = structuredClone(candidateSpecification);
frozenCandidateSpecification.prospectiveProtocol.cutoff = {
  selectedAtExclusiveLowerBound: "2026-08-15T00:00:00+09:00",
  sourceCommit: "d".repeat(40),
  logicFingerprint: `sha256:${"e".repeat(64)}`,
  status: "frozen"
};
const frozenCandidateSpecFingerprint =
  candidateBranch.candidateSpecFingerprint(frozenCandidateSpecification);
const approvedCandidateAnalysis = {
  ...candidateAnalysis,
  candidate: {
    ...frozenCandidateSpecification,
    sourceProposalFingerprint: proposalFingerprint,
    candidateSpecFingerprint: frozenCandidateSpecFingerprint,
    approved: true,
    approvedSpecFingerprint: frozenCandidateSpecFingerprint
  }
};
report = phase10.build(proposal(true), approvedCandidateAnalysis, forgedImplementationManifest);
assert.equal(report.status, "waiting-for-shadow-implementation-verifier");
assert.equal(report.readinessChecks.cutoffFrozen, true);
assert.equal(report.readinessChecks.shadowImplementationVerifierPresent, false);
assert.equal(report.readinessChecks.allPassed, false);
assert.equal(report.candidateSpecificationApproved, true);
assert.equal(report.candidateB, null, "架空manifestだけではBを作らない");
assert.equal(report.comparison.minimumComparableRaces, 100);
assert.deepEqual(report.metricOrder, ["recoveryRate", "practicalHitRate", "skipDecisionAccuracy", "hitRate"]);
assert.equal(report.comparison.automaticWinnerSelection, false);
assert.equal(report.automaticApplication, false);
assert.equal(report.usableForPrediction, false);

const tamperedCandidateAnalysis = structuredClone(approvedCandidateAnalysis);
tamperedCandidateAnalysis.candidate.proposedChange.effectiveValue = 999;
tamperedCandidateAnalysis.candidate.prospectiveProtocol.fixedComparableRaces = 50;
report = phase10.build(proposal(true), tamperedCandidateAnalysis, forgedImplementationManifest);
assert.equal(report.status, "waiting-for-approved-candidate-specification");
assert.equal(report.readinessChecks.validCandidateSpecFingerprint, false);
assert.equal(report.candidateB, null, "仕様改変後に旧fingerprintを残してもBを作らない");
console.log("Phase10 theory A/B foundation tests passed");
