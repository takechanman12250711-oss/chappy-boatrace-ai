"use strict";

const assert = require("node:assert/strict");
const engine = require("./build-race-flow-4kado-alert-skip-ab-report");
const sourceReport = require("./build-frame-rise-fall-shadow-result-report");

function record(i, label, capturedAt) {
  return {
    date: "20260817",
    jcd: "05",
    raceNo: i,
    capturedAt,
    unusedPayload: "drop-record-field",
    prediction: {
      raceFlow: {
        scenario: { title: label, unusedPayload: "drop-scenario-field" },
        unusedPayload: "drop-race-flow-field"
      },
      practicalTickets: ["1-2-3", "1-3-2"],
      unusedPayload: "drop-prediction-field"
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
    unusedPayload: "drop-result-field",
    trifecta: { combination, payout, unusedPayload: "drop-trifecta-field" }
  };
}

const after = "2026-08-17T06:46:00Z";
const before = "2026-08-17T06:44:00Z";
const rows = [
  record(1, "4カド攻め警戒", after),
  record(2, "1号艇逃げ", after),
  record(3, "4カド攻め警戒", before)
];
rows[0].selection = { scenarioLabel: "2コース差し" };
const results = [
  result(rows[0], "2-1-3", 1000),
  result(rows[1], "1-2-3", 900),
  result(rows[2], "1-2-3", 700)
];
const rawPredictionDocs = [
  {
    unusedPayload: "drop-document-field",
    predictions: [],
    verificationPredictions: rows
  }
];
const rawResultDocs = [
  {
    unusedPayload: "drop-document-field",
    races: results
  }
];
const compactPredictionDocs = rawPredictionDocs.map(engine.compactPredictionDoc);
const compactResultDocs = rawResultDocs.map(sourceReport.compactResultDoc);

assert.equal(
  Object.hasOwn(compactPredictionDocs[0].verificationPredictions[0], "unusedPayload"),
  false
);
assert.equal(
  Object.hasOwn(compactPredictionDocs[0].verificationPredictions[0].prediction, "unusedPayload"),
  false
);
assert.equal(
  Object.hasOwn(compactResultDocs[0].races[0], "unusedPayload"),
  false
);

const report = engine.build(rawPredictionDocs, rawResultDocs);
const compactReport = engine.build(compactPredictionDocs, compactResultDocs);

assert.deepEqual(compactReport.cohort, report.cohort);
assert.deepEqual(compactReport.a, report.a);
assert.deepEqual(compactReport.b, report.b);
assert.deepEqual(compactReport.delta, report.delta);
assert.deepEqual(compactReport.interpretation, report.interpretation);
assert.equal(report.productionChanged, false);
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
  [{
    predictions: [record(10, "1号艇逃げ", after)],
    verificationPredictions: [record(10, "4カド攻め警戒", after)]
  }],
  [{ races: [result(record(10, "1号艇逃げ", after), "1-2-3", 900)] }]
);
assert.equal(selectedPreferred.cohort.raceCount, 1);
assert.equal(selectedPreferred.cohort.targetRaceCount, 0);
console.log("race-flow 4kado alert skip A/B report test: ok");
