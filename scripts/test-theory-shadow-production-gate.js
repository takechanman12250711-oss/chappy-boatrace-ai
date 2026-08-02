"use strict";
const assert = require("node:assert/strict");
const gate = require("../js/theory-shadow-production-gate");

function record(index, points, jcd = "20") {
  const ticket = "1-2-3";
  return {
    raceKey: `202608${String(Math.floor(index / 12) + 1).padStart(2, "0")}-${jcd}-${(index % 12) + 1}`,
    jcd,
    theoryShadowAb: {
      b: { tickets: [{ ticket, adjustmentPoints: points, changed: points !== 0, theories: [{ theoryKey: "wall" }] }] }
    },
    result: { settled: true, resultTicket: ticket }
  };
}

const strong = [];
for (let i = 0; i < 120; i++) strong.push(record(i, i % 4 === 0 ? -2 : 2));
const approved = gate.build(strong);
assert.equal(approved.productionCandidate, true);
assert.equal(approved.status, "production-candidate");
assert.equal(approved.usableForPrediction, false);
assert.equal(approved.automaticApplication, false);

const short = gate.build(strong.slice(0, 60));
assert.equal(short.productionCandidate, false);
assert.equal(short.checks.enoughComparable, false);

const reversed = [];
for (let i = 0; i < 120; i++) reversed.push(record(i, i < 60 ? 2 : -2));
const unstable = gate.build(reversed);
assert.equal(unstable.productionCandidate, false);
assert.equal(unstable.checks.secondHalfBLeading, false);

const venueBad = [];
for (let i = 0; i < 100; i++) venueBad.push(record(i, 2, "20"));
for (let i = 100; i < 120; i++) venueBad.push(record(i, -2, "21"));
const regressed = gate.build(venueBad);
assert.equal(regressed.productionCandidate, false);
assert.equal(regressed.checks.noMajorVenueRegression, false);

console.log("theory shadow production gate tests passed");
