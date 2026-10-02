"use strict";

const candidateBranch = require("./theory-candidate-branch-analysis-phase9");

function validCutoff(cutoff = {}) {
  const selectedAt = String(cutoff?.selectedAtExclusiveLowerBound || "");
  return cutoff?.status === "frozen" &&
    /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(selectedAt) &&
    Number.isFinite(Date.parse(selectedAt)) &&
    /^[0-9a-f]{40}$/.test(String(cutoff?.sourceCommit || "")) &&
    /^sha256:[0-9a-f]{64}$/.test(String(cutoff?.logicFingerprint || ""));
}

function apply(phase9 = {}, candidateAnalysis = {}, approval = {}) {
  const proposal = phase9?.proposal || null;
  const candidate = candidateAnalysis?.candidate || null;
  const proposalFingerprint = proposal
    ? candidateBranch.proposalFingerprint(proposal)
    : null;
  const candidateFingerprint = candidate
    ? candidateBranch.candidateSpecFingerprint(candidate)
    : null;

  const approvalMatches = Boolean(
    approval?.approved === true &&
    proposal &&
    candidate &&
    String(approval?.proposal?.theoryKey || "") === String(proposal?.theoryKey || "") &&
    String(approval?.proposal?.proposalFingerprint || "") === proposalFingerprint &&
    String(candidate?.candidateId || "") === String(approval?.candidate?.candidateId || "") &&
    String(approval?.candidate?.preCutoffSpecFingerprint || "") === candidateFingerprint &&
    validCutoff(approval?.cutoff)
  );

  if (!approvalMatches) {
    return {
      phase9,
      candidateAnalysis,
      approvalApplied: false,
      reason: "approval-fingerprint-mismatch"
    };
  }

  const approvedProposal = {
    ...proposal,
    approved: true,
    approvedAt: String(approval?.humanApprovedAt || ""),
    approvalId: String(approval?.approvalId || "")
  };
  const candidateWithCutoff = {
    ...candidate,
    prospectiveProtocol: {
      ...(candidate?.prospectiveProtocol || {}),
      cutoff: { ...(approval?.cutoff || {}) }
    }
  };
  const approvedFingerprint =
    candidateBranch.candidateSpecFingerprint(candidateWithCutoff);
  const approvedCandidate = {
    ...candidateWithCutoff,
    candidateSpecFingerprint: approvedFingerprint,
    approved: true,
    approvedSpecFingerprint: approvedFingerprint,
    status: "approved-for-prospective-shadow-ab",
    approvalId: String(approval?.approvalId || ""),
    approvedAt: String(approval?.humanApprovedAt || "")
  };

  return {
    phase9: {
      ...phase9,
      proposal: approvedProposal
    },
    candidateAnalysis: {
      ...candidateAnalysis,
      candidate: approvedCandidate
    },
    approvalApplied: true,
    reason: "approved-and-cutoff-frozen",
    approvalId: String(approval?.approvalId || "")
  };
}

module.exports = { validCutoff, apply };
