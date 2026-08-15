"use strict";

const candidateBranchAnalysis = require("./theory-candidate-branch-analysis-phase9");
const frameShadowVerifier = require("./frame-rise-fall-shadow-off-verifier");

const METRIC_ORDER = Object.freeze([
  "recoveryRate",
  "practicalHitRate",
  "skipDecisionAccuracy",
  "hitRate"
]);
const SHADOW_IMPLEMENTATION_VERIFIER_PRESENT = frameShadowVerifier.PRESENT === true;

function frozenCutoff(candidate = {}) {
  const cutoff = candidate?.prospectiveProtocol?.cutoff || {};
  const selectedAt = String(cutoff?.selectedAtExclusiveLowerBound || "");
  return cutoff?.status === "frozen" &&
    /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(selectedAt) &&
    Number.isFinite(Date.parse(selectedAt)) &&
    /^[0-9a-f]{40}$/.test(String(cutoff?.sourceCommit || "")) &&
    /^sha256:[0-9a-f]{64}$/.test(String(cutoff?.logicFingerprint || ""));
}

function build(phase9 = {}, candidateAnalysis = {}) {
  const proposal = phase9?.proposal || null;
  const candidate = candidateAnalysis?.candidate || null;
  const proposalReady = phase9?.status === "proposal-ready" && Boolean(proposal);
  const proposalApproved = proposal?.approved === true;
  const currentProposalFingerprint = proposalReady
    ? candidateBranchAnalysis.proposalFingerprint(proposal)
    : null;
  const proposalFingerprintMatches =
    Boolean(currentProposalFingerprint) &&
    candidateAnalysis?.phase9ProposalFingerprint === currentProposalFingerprint &&
    candidate?.sourceProposalFingerprint === currentProposalFingerprint;
  const recalculatedCandidateSpecFingerprint = candidate
    ? candidateBranchAnalysis.candidateSpecFingerprint(candidate)
    : null;
  const validCandidateSpecFingerprint =
    /^sha256:[0-9a-f]{64}$/.test(String(candidate?.candidateSpecFingerprint || "")) &&
    candidate?.candidateSpecFingerprint === recalculatedCandidateSpecFingerprint;
  const candidateMatches =
    candidateAnalysis?.candidateCount === 1 &&
    candidateAnalysis?.targetTheoryKey === proposal?.theoryKey &&
    Boolean(candidate?.candidateId) &&
    validCandidateSpecFingerprint &&
    proposalFingerprintMatches;
  const candidateApproved =
    candidateMatches &&
    candidate?.approved === true &&
    Boolean(candidate?.candidateSpecFingerprint) &&
    candidate?.approvedSpecFingerprint === candidate?.candidateSpecFingerprint;
  const cutoffFrozen = candidateApproved && frozenCutoff(candidate);
  const implementationCheck = candidate
    ? frameShadowVerifier.verify(candidate)
    : {
        present: SHADOW_IMPLEMENTATION_VERIFIER_PRESENT,
        verified: false,
        implementationPresent: false,
        reason: "candidate-unavailable"
      };
  const shadowImplementationVerified = implementationCheck.verified === true;
  const shadowImplementationPresent = implementationCheck.implementationPresent === true;
  const ready =
    proposalReady &&
    proposalApproved &&
    candidateApproved &&
    cutoffFrozen &&
    SHADOW_IMPLEMENTATION_VERIFIER_PRESENT &&
    shadowImplementationVerified;
  const requestedComparableRaces = Number(
    candidate?.prospectiveProtocol?.fixedComparableRaces
  );
  const minimumComparableRaces = Number.isFinite(requestedComparableRaces)
    ? Math.max(50, Math.floor(requestedComparableRaces))
    : 50;
  const status = !proposalReady || !proposalApproved
    ? "waiting-for-approved-phase9-proposal"
    : !candidateMatches || !candidateApproved
      ? "waiting-for-approved-candidate-specification"
      : !cutoffFrozen
        ? "waiting-for-frozen-prospective-cutoff"
        : !SHADOW_IMPLEMENTATION_VERIFIER_PRESENT
          ? "waiting-for-shadow-implementation-verifier"
          : !shadowImplementationPresent || !shadowImplementationVerified
            ? "waiting-for-shadow-implementation"
            : "ready-for-shadow-ab";

  return {
    schemaVersion: 1,
    engineVersion: "theory-ab-phase10-20260815-shadow-verifier",
    status,
    sourceStatus: String(phase9?.status || "unknown"),
    candidateSourceStatus: String(candidateAnalysis?.status || "unknown"),
    implementationSourceStatus: String(implementationCheck?.reason || "unknown"),
    metricOrder: [...METRIC_ORDER],
    baselineA: {
      label: "A: current-production",
      immutable: true,
      productionPrediction: true,
      productionPurchaseSelection: true
    },
    candidateB: ready ? {
      candidateId: String(candidate?.candidateId || ""),
      label: `B: ${String(candidate?.label || "approved-improvement-shadow")}`,
      theoryKey: String(proposal?.theoryKey || ""),
      theoryLabel: String(proposal?.label || proposal?.theoryKey || ""),
      focusMetric: String(proposal?.focusMetric || ""),
      changeCandidate: String(proposal?.changeCandidate || ""),
      rationale: String(proposal?.rationale || ""),
      expectedEffect: String(proposal?.expectedEffect || ""),
      applicability: candidate?.applicability || null,
      proposedChange: candidate?.proposedChange || null,
      prospectiveProtocol: candidate?.prospectiveProtocol || null,
      implementationFingerprint: String(implementationCheck?.implementationFingerprint || ""),
      shadowOnly: true,
      productionPrediction: false,
      productionPurchaseSelection: false
    } : null,
    comparison: {
      minimumComparableRaces,
      metrics: [...METRIC_ORDER],
      resultStatuses: ["a-win", "b-win", "draw", "insufficient-data"],
      automaticWinnerSelection: false
    },
    readinessChecks: {
      proposalReady,
      proposalApproved,
      proposalFingerprintMatches,
      validCandidateSpecFingerprint,
      recalculatedCandidateSpecFingerprint,
      candidateMatches,
      candidateApproved,
      cutoffFrozen,
      shadowImplementationVerifierPresent: SHADOW_IMPLEMENTATION_VERIFIER_PRESENT,
      shadowImplementationVerified,
      shadowImplementationPresent,
      implementationCandidateSpecMatches: implementationCheck?.candidateSpecMatches === true,
      implementationFingerprint: String(implementationCheck?.implementationFingerprint || ""),
      allPassed: ready
    },
    proposalApproved,
    currentProposalFingerprint,
    candidateSpecificationApproved: candidateApproved,
    shadowImplementationPresent,
    humanApprovalRequired: true,
    automaticApplication: false,
    usableForPrediction: false,
    uiVisible: false
  };
}

module.exports = { METRIC_ORDER, SHADOW_IMPLEMENTATION_VERIFIER_PRESENT, frozenCutoff, build };
