"use strict";

const crypto = require("node:crypto");

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((out, key) => {
      out[key] = stable(value[key]);
      return out;
    }, {});
  }
  return value;
}

function fingerprint(review = {}) {
  const payload = {
    productionCandidate: review?.productionCandidate === true,
    summary: review?.summary || {},
    checks: review?.checks || {},
    firstHalf: review?.firstHalf || null,
    secondHalf: review?.secondHalf || null,
    venueChecks: review?.venueChecks || [],
    approvedTheoryCandidates: review?.approvedTheoryCandidates || []
  };
  return crypto.createHash("sha256")
    .update(JSON.stringify(stable(payload)))
    .digest("hex");
}

function validate(review = {}, approval = {}) {
  const currentFingerprint = fingerprint(review);
  const approvedFingerprint = String(approval?.candidateFingerprint || "");
  const candidateReady = review?.productionCandidate === true;
  const explicitlyApproved = approval?.approved === true;
  const approver = String(approval?.approvedBy || "").trim();
  const approvedAt = String(approval?.approvedAt || "").trim();
  const fingerprintMatches = approvedFingerprint === currentFingerprint;
  const valid = candidateReady && explicitlyApproved && Boolean(approver) && Boolean(approvedAt) && fingerprintMatches;

  const reasons = [];
  if (!candidateReady) reasons.push("production-candidate-not-ready");
  if (!explicitlyApproved) reasons.push("explicit-approval-missing");
  if (!approver) reasons.push("approver-missing");
  if (!approvedAt) reasons.push("approved-at-missing");
  if (approvedFingerprint && !fingerprintMatches) reasons.push("candidate-changed-after-approval");
  if (!approvedFingerprint) reasons.push("candidate-fingerprint-missing");

  return {
    version: "1.0.0",
    status: valid ? "human-approved" : candidateReady ? "awaiting-human-approval" : "collecting-evidence",
    candidateFingerprint: currentFingerprint,
    approvedFingerprint,
    fingerprintMatches,
    humanApprovalRequired: true,
    humanApproved: valid,
    adoptionAllowed: valid,
    approvedBy: valid ? approver : "",
    approvedAt: valid ? approvedAt : "",
    reasons,
    automaticApplication: false,
    usableForPrediction: false
  };
}

module.exports = { stable, fingerprint, validate };
