"use strict";

const assert = require("node:assert/strict");
const review = require("../js/theory-adoption-review-report");

const improvement = {
  approvalGate: {
    approvedCandidates: [
      {
        scope: "theory",
        theoryKey: "wall-boat",
        label: "壁艇理論",
        suggestedAdjustmentPoints: 2,
        approved: true,
        firstHalf: { samples: 30 },
        secondHalf: { samples: 30 }
      },
      {
        scope: "venue-theory",
        theoryKey: "new-engine",
        label: "新エンジン理論",
        place: "多摩川",
        jcd: "05",
        suggestedAdjustmentPoints: -2,
        status: "approved"
      }
    ]
  }
};

const ready = review.build({
  productionCandidate: true,
  checks: {
    enoughComparable: true,
    enoughBWins: true,
    enoughAdvantage: true,
    firstHalfBLeading: true,
    secondHalfBLeading: true,
    noMajorVenueRegression: true
  },
  overall: { comparableCount: 120, bWins: 50, aWins: 30, advantagePoints: 16.7 },
  firstHalf: { comparableCount: 60, bWins: 25, aWins: 15 },
  secondHalf: { comparableCount: 60, bWins: 25, aWins: 15 },
  harmfulVenueCount: 0,
  venueChecks: [{ jcd: "05", comparableCount: 12, bWins: 7, aWins: 3 }]
}, improvement);

assert.equal(ready.status, "awaiting-human-approval");
assert.equal(ready.productionCandidate, true);
assert.equal(ready.humanApprovalRequired, true);
assert.equal(ready.humanApproved, false);
assert.equal(ready.adoptionAllowed, false);
assert.equal(ready.approvedTheoryCandidates.length, 2);
assert.equal(ready.approvedTheoryCandidates[1].label, "多摩川 × 新エンジン理論");
assert.equal(ready.usableForPrediction, false);
assert.equal(ready.automaticApplication, false);

const collecting = review.build({
  productionCandidate: false,
  checks: { enoughComparable: false, secondHalfBLeading: false },
  overall: { comparableCount: 40, bWins: 12, aWins: 10 }
}, improvement);

assert.equal(collecting.status, "collecting-evidence");
assert.deepEqual(collecting.failedChecks.sort(), ["enoughComparable", "secondHalfBLeading"].sort());
assert.equal(collecting.adoptionAllowed, false);

console.log("theory adoption review report tests passed");
