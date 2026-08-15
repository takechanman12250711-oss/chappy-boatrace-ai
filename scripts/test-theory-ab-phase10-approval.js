"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const engine = require("../js/theory-ab-phase10");

const root = path.resolve(__dirname, "..");
const load = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const phase9 = load("data/stats/theory-improvement-proposal-phase9.json");
const candidate = load("data/stats/theory-candidate-branch-analysis-phase9.json");
const approval = load("config/theory-ab-phase10-approval.json");

const report = engine.build(phase9, candidate, approval);
assert.equal(report.status, "ready-for-shadow-ab");
assert.equal(report.readinessChecks.approvalApplied, true);
assert.equal(report.readinessChecks.proposalApproved, true);
assert.equal(report.readinessChecks.candidateApproved, true);
assert.equal(report.readinessChecks.cutoffFrozen, true);
assert.equal(report.readinessChecks.shadowImplementationVerified, true);
assert.equal(report.readinessChecks.allPassed, true);
assert.ok(report.candidateB);
assert.equal(report.candidateB.shadowOnly, true);
assert.equal(report.candidateB.productionPrediction, false);
assert.equal(report.candidateB.productionPurchaseSelection, false);
assert.equal(report.automaticApplication, false);
assert.equal(report.usableForPrediction, false);
assert.equal(
  report.candidateB.prospectiveProtocol.cutoff.selectedAtExclusiveLowerBound,
  approval.cutoff.selectedAtExclusiveLowerBound
);
assert.equal(report.comparison.minimumComparableRaces, 100);

const badProposalApproval = structuredClone(approval);
badProposalApproval.proposal.proposalFingerprint = `sha256:${"0".repeat(64)}`;
const badProposal = engine.build(phase9, candidate, badProposalApproval);
assert.equal(badProposal.readinessChecks.approvalApplied, false);
assert.equal(badProposal.status, "waiting-for-approved-phase9-proposal");
assert.equal(badProposal.candidateB, null);

const badCandidateApproval = structuredClone(approval);
badCandidateApproval.candidate.preCutoffSpecFingerprint = `sha256:${"1".repeat(64)}`;
const badCandidate = engine.build(phase9, candidate, badCandidateApproval);
assert.equal(badCandidate.readinessChecks.approvalApplied, false);
assert.equal(badCandidate.candidateB, null);

const tamperedCandidate = structuredClone(candidate);
tamperedCandidate.candidate.proposedChange.effectiveValue = 1;
const tampered = engine.build(phase9, tamperedCandidate, approval);
assert.equal(tampered.readinessChecks.approvalApplied, false);
assert.equal(tampered.candidateB, null);

console.log("Phase10 frozen approval tests passed");
