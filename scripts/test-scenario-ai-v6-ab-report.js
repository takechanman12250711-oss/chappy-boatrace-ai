"use strict";

const assert = require("node:assert/strict");
const report = require("./build-scenario-ai-v6-ab-report");

function record(raceKey, aTicket, bTicket, actual, jcd = "20", changed = true) {
  return {
    raceKey,
    date: raceKey.slice(0, 8),
    jcd,
    place: jcd === "20" ? "若松" : "大村",
    scenarioAiV6ShadowAb: {
      changed,
      a: { scenarios: [{ scenarioType: "escape", representativeTicket: aTicket }] },
      b: { scenarios: [{ scenarioType: "sashi", representativeTicket: bTicket }] }
    },
    scenarioAiV6Verification: { actualOrder: actual.split("-").map(Number) }
  };
}

const comparison = report.compareRecord(record("20260101-20-1", "1-2-3", "2-1-3", "2-1-3"));
assert.equal(comparison.winner, "B");
assert.equal(comparison.b.exact, true);
assert.equal(comparison.a.exact, false);

const tie = report.compareRecord(record("20260101-20-2", "1-2-3", "1-3-2", "1-4-5"));
assert.equal(tie.winner, "tie");
assert.equal(tie.a.firstHit, true);
assert.equal(tie.b.firstHit, true);

const rows = [];
for (let index = 0; index < 120; index += 1) {
  const bWin = index % 3 !== 0;
  rows.push(record(
    `2026${String(100 + index).padStart(4, "0")}-20-${index + 1}`,
    bWin ? "1-2-3" : "2-1-3",
    bWin ? "2-1-3" : "1-2-3",
    "2-1-3",
    "20"
  ));
}
const built = report.buildReport([{ verificationPredictions: rows }]);
assert.equal(built.overall.comparableCount, 120);
assert.ok(built.overall.bWins > built.overall.aWins);
assert.equal(built.productionGate.productionCandidate, true);
assert.equal(built.usableForPrediction, false);
assert.equal(built.automaticApplication, false);

const regressionRows = [];
for (let index = 0; index < 20; index += 1) {
  regressionRows.push(record(`202602${String(index + 1).padStart(2, "0")}-24-${index + 1}`, "1-2-3", "2-1-3", "1-2-3", "24"));
}
const regression = report.buildReport([{ verificationPredictions: [...rows, ...regressionRows] }]);
assert.ok(regression.majorVenueRegression.length >= 1);
assert.equal(regression.productionGate.productionCandidate, false);

console.log("scenario AI v6 A/B report tests passed");
