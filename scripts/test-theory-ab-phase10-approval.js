"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const builder = require("./build-theory-ab-phase10");

const root = path.resolve(__dirname, "..");
const load = file => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const phase9 = load("data/stats/theory-improvement-proposal-phase9.json");
const candidate = load("data/stats/theory-candidate-branch-analysis-phase9.json");
const approval = load("config/theory-ab-phase10-approval.json");
const frozen = load("config/theory-ab-phase10-approved-source.json");

const report = builder.buildReport({
  phase9,
  candidateAnalysis: candidate,
  approval,
  approvedSource: frozen,
  generatedAt: "2026-08-15T02:06:15.000Z"
});
assert.equal(report.status, "ready-for-shadow-ab");
assert.equal(report.approvedSourceFrozen, true);
assert.equal(report.approvedSourceMetadataMatches, true);
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
const badProposal = builder.buildReport({ phase9, candidateAnalysis: candidate, approval: badProposalApproval, approvedSource: frozen });
assert.equal(badProposal.readinessChecks.approvalApplied, false);
assert.equal(badProposal.status, "waiting-for-approved-phase9-proposal");
assert.equal(badProposal.candidateB, null);

const badCandidateApproval = structuredClone(approval);
badCandidateApproval.candidate.preCutoffSpecFingerprint = `sha256:${"1".repeat(64)}`;
const badCandidate = builder.buildReport({ phase9, candidateAnalysis: candidate, approval: badCandidateApproval, approvedSource: frozen });
assert.equal(badCandidate.readinessChecks.approvalApplied, false);
assert.equal(badCandidate.candidateB, null);

const tamperedFrozen = structuredClone(frozen);
tamperedFrozen.candidateAnalysis.candidate.proposedChange.effectiveValue = 1;
const tampered = builder.buildReport({ phase9, candidateAnalysis: candidate, approval, approvedSource: tamperedFrozen });
assert.equal(tampered.readinessChecks.approvalApplied, false);
assert.equal(tampered.candidateB, null);

const expandedPhase9 = structuredClone(phase9);
expandedPhase9.proposal.evidenceCount += 100;
expandedPhase9.proposal.currentValue = 99.9;
const expandedCandidate = structuredClone(candidate);
expandedCandidate.phase9ProposalFingerprint = `sha256:${"2".repeat(64)}`;
expandedCandidate.candidate.sourceProposalFingerprint = `sha256:${"2".repeat(64)}`;
const frozenAfterEvidenceGrowth = builder.buildReport({
  phase9: expandedPhase9,
  candidateAnalysis: expandedCandidate,
  approval,
  approvedSource: frozen
});
assert.equal(frozenAfterEvidenceGrowth.status, "ready-for-shadow-ab");
assert.equal(frozenAfterEvidenceGrowth.currentProposalFingerprint, approval.proposal.proposalFingerprint);
assert.equal(frozenAfterEvidenceGrowth.candidateB.prospectiveProtocol.fixedComparableRaces, 100);
assert.equal(frozenAfterEvidenceGrowth.automaticApplication, false);
assert.equal(frozenAfterEvidenceGrowth.usableForPrediction, false);

const wrongMetadata = structuredClone(frozen);
wrongMetadata.sourceCommit = "0".repeat(40);
const metadataRejected = builder.buildReport({ phase9, candidateAnalysis: candidate, approval, approvedSource: wrongMetadata });
assert.equal(metadataRejected.approvedSourceMetadataMatches, false);
assert.equal(metadataRejected.readinessChecks.approvalApplied, false);
assert.equal(metadataRejected.candidateB, null);

console.log("Phase10 frozen approval tests passed");
