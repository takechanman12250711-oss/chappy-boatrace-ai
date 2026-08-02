"use strict";

const assert = require("node:assert/strict");
const review = require("./build-scenario-ai-v6-adoption-review");

function makeAb(overrides = {}) {
  return {
    overall: { comparableCount: 120, aWins: 35, bWins: 45, ties: 40, bExactLift: 6, bFirstHitLift: 8 },
    firstHalf: { aWins: 17, bWins: 22 },
    secondHalf: { aWins: 18, bWins: 23 },
    majorVenueRegression: [],
    productionGate: { productionCandidate: true },
    ...overrides
  };
}

function makeRepro() {
  return {
    approvalGate: {
      approvedCandidates: [
        { approved: true, scope: "scenario-type", key: "sashi", label: "差し", action: "raise", adjustment: 2 },
        { approved: true, scope: "venue-scenario-type", key: "20:sashi", label: "若松 × 差し", action: "raise", adjustment: 2 }
      ]
    }
  };
}

{
  const result = review.buildReview(makeAb(), makeRepro());
  assert.equal(result.status, "awaiting-human-approval");
  assert.equal(result.humanApprovalRequired, true);
  assert.equal(result.humanApproved, false);
  assert.equal(result.adoptionAllowed, false);
  assert.equal(result.approvedAdjustments.length, 2);
  assert.equal(result.missingConditions.length, 0);
}

{
  const result = review.buildReview(makeAb({ overall: { comparableCount: 80, aWins: 25, bWins: 30, ties: 25 } }), makeRepro());
  assert.equal(result.status, "collecting-evidence");
  assert.ok(result.missingConditions.includes("比較可能100R以上"));
}

{
  const result = review.buildReview(makeAb({ majorVenueRegression: [{ jcd: "20", aWins: 8, bWins: 3 }] }), makeRepro());
  assert.equal(result.status, "collecting-evidence");
  assert.ok(result.missingConditions.includes("重大な場別悪化なし"));
}

{
  const result = review.buildReview(makeAb(), { approvalGate: { approvedCandidates: [] } });
  assert.equal(result.status, "collecting-evidence");
  assert.ok(result.missingConditions.includes("承認候補の補正内容あり"));
}

console.log("scenario AI v6 adoption review tests passed");
