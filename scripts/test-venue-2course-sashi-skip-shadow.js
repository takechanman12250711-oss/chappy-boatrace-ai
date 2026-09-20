"use strict";

const assert = require("node:assert/strict");
const engine = require("./build-venue-2course-sashi-skip-shadow");

function record(i, jcd, label, selectedAt, source = "selected") {
  return {
    date: "20260921",
    jcd,
    raceNo: i,
    selectedAt,
    deadlineAt: "2026-09-21T01:00:00.000Z",
    source,
    prediction: {
      raceFlow: { scenario: { title: label } },
      practicalTickets: ["1-2-3", "1-3-2"]
    }
  };
}

function result(row, combination, payout) {
  return {
    date: row.date,
    jcd: row.jcd,
    raceNo: row.raceNo,
    resultAvailable: true,
    status: "finished",
    trifecta: { combination, payout }
  };
}

const before = "2026-09-20T23:59:59.999Z";
const after = "2026-09-21T00:00:00.000Z";
const kiryuTarget = record(1, "01", "2コース差し", after);
const tokuyamaOther = record(2, "18", "2コース差し本線", after);
const unrelatedVenue = record(3, "20", "2コース差し", after);
const discoveryPeriod = record(4, "01", "2コース差し", before);
const selectedPreferred = record(5, "18", "1号艇逃げ", after, "selected");
const verificationDuplicate = record(5, "18", "2コース差し", after, "verification");
const unsettledTarget = record(6, "18", "2コース差し", after);
const postDeadline = record(7, "01", "2コース差し", "2026-09-21T02:00:00.000Z");
const missingDeadline = record(8, "18", "2コース差し", after);
delete missingDeadline.deadlineAt;
const embeddedOnly = record(9, "01", "2コース差し", after);
embeddedOnly.result = { settled: true, resultTicket: "1-2-3", payout: 9999 };

const report = engine.build([
  {
    predictions: [kiryuTarget, tokuyamaOther, unrelatedVenue, discoveryPeriod, selectedPreferred, unsettledTarget, postDeadline, missingDeadline, embeddedOnly],
    verificationPredictions: [verificationDuplicate]
  }
], [{
  races: [
    result(kiryuTarget, "2-1-3", 1200),
    result(tokuyamaOther, "1-2-3", 900),
    result(unrelatedVenue, "1-2-3", 800),
    result(discoveryPeriod, "1-2-3", 700),
    result(selectedPreferred, "1-3-2", 1000)
  ]
}]);

assert.equal(report.version, engine.VERSION);
assert.equal(report.baseRuleVersion, "race-flow-2course-sashi-skip-ab-v1-prospective");
assert.equal(report.productionChanged, false);
assert.equal(report.automaticProductionChange, false);
assert.equal(report.usableForPrediction, false);
assert.deepEqual(report.targetVenues.map(row => row.jcd), ["01", "18"]);
assert.equal(report.preregistration.cutoffSelectedAtInclusive, engine.PROSPECTIVE_CUTOFF);
assert.equal(report.preregistration.discoveryRowsUsableForValidation, false);
assert.equal(report.preregistration.oldRecordsBackfilled, false);
assert.equal(report.preregistration.exactScenarioLabelOnly, true);
assert.equal(report.cohort.raceCount, 5);
assert.equal(report.cohort.settledCount, 3);
assert.equal(report.cohort.targetRaceCount, 3);
assert.equal(report.cohort.targetSettledCount, 1);
assert.equal(report.a.stake, 600);
assert.equal(report.a.return, 1900);
assert.equal(report.b.stake, 400);
assert.equal(report.b.return, 1900);
assert.equal(report.b.skippedRaceCount, 1);
assert.equal(report.delta.profit, 200);
assert.equal(report.byVenue.length, 2);
assert.equal(report.byVenue.find(row => row.jcd === "01").cohort.targetSettledCount, 1);
assert.equal(report.byVenue.find(row => row.jcd === "18").cohort.targetRaceCount, 1);
assert.equal(report.byVenue.every(row => row.validationReady === false), true);
assert.equal(report.interpretation.automaticApplication, false);
assert.equal(report.interpretation.automaticPhase8Handoff, false);
assert.equal(report.interpretation.affectsCurrentTickets, false);
assert.equal(report.interpretation.adoptionRequiresUserApproval, true);

console.log("venue 2course sashi prospective shadow test: ok");
