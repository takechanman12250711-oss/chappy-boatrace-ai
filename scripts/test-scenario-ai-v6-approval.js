"use strict";

const assert = require("node:assert/strict");
const {
  buildStatus,
  fingerprint,
  canonicalCandidate
} = require("./build-scenario-ai-v6-approval-status");

function candidateCohortCheck(
  trainingFingerprint = "training-cohort-v1",
  candidateSetFingerprint = "scenario-type:sashi:2"
) {
  return {
    key: "candidate-cohort-match",
    label: "A/B候補セット・学習世代が再現性ゲートと一致",
    passed: true,
    actual: {
      activeCandidateSetFingerprint: candidateSetFingerprint,
      approvedCandidateSetFingerprint: candidateSetFingerprint,
      activeCandidateTrainingFingerprint: trainingFingerprint,
      reproTrainingFingerprint: trainingFingerprint
    }
  };
}

function legacyReview(overrides = {}) {
  return {
    status: "awaiting-human-approval",
    evidence: { comparableCount: 120, aWins: 35, bWins: 48, ties: 37 },
    firstHalf: { aWins: 16, bWins: 24 },
    secondHalf: { aWins: 19, bWins: 24 },
    majorVenueRegression: [],
    adoptionTargets: [{ scope: "scenario-type", key: "sashi", adjustment: 2 }],
    conditionChecks: [{ key: "productionCandidate", passed: true }],
    ...overrides
  };
}

function review(overrides = {}) {
  return {
    status: "awaiting-human-approval",
    summary: { comparableCount: 120, aWins: 35, bWins: 48, ties: 37 },
    firstHalf: { aWins: 16, bWins: 24 },
    secondHalf: { aWins: 19, bWins: 24 },
    majorVenueRegression: [],
    approvedAdjustments: [{ scope: "scenario-type", key: "sashi", adjustment: 2 }],
    checklist: [
      { key: "minimum-comparisons", passed: true, actual: 120 },
      candidateCohortCheck()
    ],
    ...overrides
  };
}

const legacyCandidate = legacyReview();
assert.equal(
  fingerprint(legacyCandidate),
  "2dba6821e8ca3b3ff960a07812853a915aaa7b88c7ce24c341f333f153f780c1"
);

const candidate = review();
const fp = fingerprint(candidate);

let status = buildStatus(candidate, { approved: false });
assert.equal(status.status, "awaiting-human-approval");
assert.equal(status.adoptionAllowed, false);

status = buildStatus(candidate, {
  approved: true,
  candidateFingerprint: fp,
  approvedBy: "operator",
  approvedAt: "2026-08-02T05:00:00Z"
});
assert.equal(status.status, "approved");
assert.equal(status.humanApproved, true);
assert.equal(status.adoptionAllowed, true);
assert.equal(status.usableForPrediction, false);
assert.equal(status.automaticApplication, false);

const changed = review({ summary: { comparableCount: 121, aWins: 35, bWins: 49, ties: 37 } });
status = buildStatus(changed, {
  approved: true,
  candidateFingerprint: fp,
  approvedBy: "operator",
  approvedAt: "2026-08-02T05:00:00Z"
});
assert.equal(status.status, "candidate-changed-after-approval");
assert.equal(status.adoptionAllowed, false);

const changedCohort = review({
  checklist: [
    { key: "minimum-comparisons", passed: true, actual: 120 },
    candidateCohortCheck("training-cohort-v2")
  ]
});
status = buildStatus(changedCohort, {
  approved: true,
  candidateFingerprint: fp,
  approvedBy: "operator",
  approvedAt: "2026-08-02T05:00:00Z"
});
assert.equal(status.status, "candidate-changed-after-approval");
assert.equal(status.fingerprintMatches, false);
assert.equal(status.adoptionAllowed, false);

const changedCandidateSet = review({
  checklist: [
    { key: "minimum-comparisons", passed: true, actual: 120 },
    candidateCohortCheck(
      "training-cohort-v1",
      "scenario-type:sashi:2|venue-scenario-type:20:sashi:2"
    )
  ]
});
assert.notEqual(fingerprint(changedCandidateSet), fp);

const currentAsLegacy = {
  status: candidate.status,
  evidence: candidate.summary,
  firstHalf: candidate.firstHalf,
  secondHalf: candidate.secondHalf,
  majorVenueRegression: candidate.majorVenueRegression,
  adoptionTargets: candidate.approvedAdjustments,
  conditionChecks: candidate.checklist
};
assert.deepEqual(canonicalCandidate(currentAsLegacy), canonicalCandidate(candidate));
assert.equal(fingerprint(currentAsLegacy), fp);

status = buildStatus(review({ status: "collecting-evidence" }), {
  approved: true,
  candidateFingerprint: fp,
  approvedBy: "operator",
  approvedAt: "2026-08-02T05:00:00Z"
});
assert.equal(status.status, "not-candidate");
assert.equal(status.adoptionAllowed, false);

status = buildStatus(candidate, {
  approved: true,
  candidateFingerprint: fp,
  approvedBy: "",
  approvedAt: "2026-08-02T05:00:00Z"
});
assert.equal(status.status, "invalid-approval");

console.log("展開AI v6承認テスト成功");
