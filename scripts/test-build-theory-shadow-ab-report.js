"use strict";

const assert = require("node:assert/strict");
const report = require("./build-theory-shadow-ab-report");

function record(raceKey, jcd, ticket, points, theoryKey) {
  return {
    raceKey,
    jcd,
    result: { settled: true, resultTicket: ticket },
    theoryShadowAb: {
      b: {
        tickets: [
          {
            ticket,
            adjustmentPoints: points,
            changed: points !== 0,
            theories: [{ theoryKey, adjustmentPoints: points }]
          }
        ]
      }
    }
  };
}

const built = report.build([
  record("20260801-01-1", "01", "1-2-3", 2, "wall"),
  record("20260801-01-2", "01", "1-3-2", -2, "wall"),
  record("20260801-02-1", "02", "2-1-3", 2, "remain")
]);

assert.equal(built.overall.comparableCount, 3);
assert.equal(built.overall.bWins, 2);
assert.equal(built.overall.aWins, 1);
assert.equal(built.byTheory.find(row => row.key === "wall").comparableCount, 2);
assert.equal(built.byVenueTheory.find(row => row.key === "01:wall").bWins, 1);
assert.equal(built.usableForPrediction, false);
assert.equal(built.automaticApplication, false);

console.log("theory shadow A/B report tests passed");
