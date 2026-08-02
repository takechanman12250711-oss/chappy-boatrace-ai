"use strict";

const assert = require("node:assert/strict");
const approval = require("../js/theory-adoption-approval");

const review = {
  productionCandidate: true,
  summary: { comparableCount: 120, bWins: 50, aWins: 30, advantagePoints: 16.7 },
  checks: { enoughComparable: true, enoughBWins: true },
  firstHalf: { bWins: 25, aWins: 15 },
  secondHalf: { bWins: 25, aWins: 15 },
  venueChecks: [{ jcd: "20", comparableCount: 20, bWins: 10, aWins: 4 }],
  approvedTheoryCandidates: [{ theoryKey: "wall", adjustmentPoints: 2 }]
};

const fp = approval.fingerprint(review);

const missing = approval.validate(review, {});
assert.equal(missing.adoptionAllowed, false);
assert.equal(missing.status, "awaiting-human-approval");

const valid = approval.validate(review, {
  approved: true,
  candidateFingerprint: fp,
  approvedBy: "owner",
  approvedAt: "2026-08-02T11:00:00+09:00"
});
assert.equal(valid.humanApproved, true);
assert.equal(valid.adoptionAllowed, true);
assert.equal(valid.fingerprintMatches, true);
assert.equal(valid.automaticApplication, false);
assert.equal(valid.usableForPrediction, false);

const changed = approval.validate({ ...review, summary: { ...review.summary, bWins: 51 } }, {
  approved: true,
  candidateFingerprint: fp,
  approvedBy: "owner",
  approvedAt: "2026-08-02T11:00:00+09:00"
});
assert.equal(changed.adoptionAllowed, false);
assert.ok(changed.reasons.includes("candidate-changed-after-approval"));

const notReady = approval.validate({ ...review, productionCandidate: false }, {
  approved: true,
  candidateFingerprint: approval.fingerprint({ ...review, productionCandidate: false }),
  approvedBy: "owner",
  approvedAt: "2026-08-02T11:00:00+09:00"
});
assert.equal(notReady.adoptionAllowed, false);
assert.equal(notReady.status, "collecting-evidence");

console.log("theory adoption approval tests passed");
