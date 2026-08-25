"use strict";

const assert = require("node:assert/strict");
const engine = require("./build-race-flow-in-first-outside-alert-skip-ab-report");

function record(i, label, capturedAt) {
  return {
    date: "20260817",
    jcd: "05",
    raceNo: i,
    capturedAt,
    prediction: {
      raceFlow: { scenario: { title: label } },
      practicalTickets: ["1-2-3", "1-3-2"]
    }
  };
}

function result(record, combination, payout) {
  return {
    date: record.date,
    jcd: record.jcd,
    raceNo: record.raceNo,
    resultAvailable: true,
    status: "finished",
    trifecta: { combination, payout }
  };
}

const after = "2026-08-17T07:19:00Z";
const before = "2026-08-17T07:17:00Z";
const rows = [
  record(1, "イン先マイ・外攻め警戒", after),
  record(2, "1号艇逃げ", after),
  record(3, "イン先マイ・外攻め警戒", before)
];
rows[0].selection = { scenarioLabel: "1号艇逃げ" };
const results = [
  result(rows[0], "2-1-3", 1000),
  result(rows[1], "1-2-3", 900),
  result(rows[2], "1-2-3", 700)
];

const report = engine.build(
  [{ predictions: [], verificationPredictions: rows }],
  [{ races: results }]
);

assert.equal(report.productionChanged, false);
assert.equal(report.targetLabel, "イン先マイ・外攻め警戒");
assert.equal(report.cohort.raceCount, 2);
assert.equal(report.cohort.targetRaceCount, 1);
assert.equal(report.a.stake, 400);
assert.equal(report.a.return, 900);
assert.equal(report.b.stake, 200);
assert.equal(report.b.return, 900);
assert.equal(report.b.skippedRaceCount, 1);
assert.equal(report.delta.profit, 200);
assert.equal(report.interpretation.automaticApplication, false);
assert.equal(report.interpretation.affectsCurrentTickets, false);
const selectedPreferred = engine.build(
  [{ predictions: [record(10, "1号艇逃げ", after)], verificationPredictions: [record(10, "イン先マイ・外攻め警戒", after)] }],
  [{ races: [result(record(10, "1号艇逃げ", after), "1-2-3", 900)] }]
);
assert.equal(selectedPreferred.cohort.raceCount, 1);
assert.equal(selectedPreferred.cohort.targetRaceCount, 0);
console.log("race-flow in-first outside-alert skip A/B report test: ok");
