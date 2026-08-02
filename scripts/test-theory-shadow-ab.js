"use strict";
const assert = require("node:assert/strict");
const shadow = require("../js/theory-shadow-ab");

const snapshot = {
  theories: [
    { theoryKey: "wall", tickets: ["1-4-3", "1-2-4"] },
    { theoryKey: "remain", tickets: ["1-4-3"] }
  ]
};
const report = {
  approvalGate: {
    approvedCandidates: [
      { approved: true, scope: "theory", theoryKey: "wall", suggestedAdjustmentPoints: 2 },
      { approved: true, scope: "venue-theory", jcd: "20", theoryKey: "remain", suggestedAdjustmentPoints: -2 }
    ]
  }
};

const result = shadow.build(snapshot, report, { jcd: "20" });
assert.equal(result.status, "shadow-adjusted");
assert.equal(result.usableForPrediction, false);
assert.equal(result.automaticApplication, false);
assert.equal(result.changedTicketCount, 1);
const first = result.b.tickets.find(row => row.ticket === "1-4-3");
const second = result.b.tickets.find(row => row.ticket === "1-2-4");
assert.equal(first.adjustmentPoints, 0);
assert.equal(second.adjustmentPoints, 2);

const noMatch = shadow.build(snapshot, report, { jcd: "24" });
assert.equal(noMatch.b.tickets.find(row => row.ticket === "1-4-3").adjustmentPoints, 2);
assert.equal(noMatch.appliedCandidateCount, 1);

const empty = shadow.build({ theories: [] }, {}, { jcd: "20" });
assert.equal(empty.status, "no-approved-adjustment");
console.log("theory shadow A/B tests passed");
