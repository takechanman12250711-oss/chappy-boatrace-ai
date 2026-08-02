"use strict";

const assert = require("node:assert/strict");
const { buildStatus, fingerprint } = require("./build-scenario-ai-v6-approval-status");

function review(overrides = {}) {
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

const changed = review({ evidence: { comparableCount: 121, aWins: 35, bWins: 49, ties: 37 } });
status = buildStatus(changed, {
  approved: true,
  candidateFingerprint: fp,
  approvedBy: "operator",
  approvedAt: "2026-08-02T05:00:00Z"
});
assert.equal(status.status, "candidate-changed-after-approval");
assert.equal(status.adoptionAllowed, false);

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
