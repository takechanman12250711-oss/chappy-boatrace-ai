"use strict";
const assert = require("node:assert/strict");
const x = require("./build-local-water-outer-head-stage-audit");

function prediction(raceNo, mainHead, extra = {}) {
  return {
    date: "20260830",
    jcd: "01",
    raceNo,
    prediction: {
      venueWaterSupport: {
        venue: "桐生",
        wind: 4,
        wave: 3,
        confirmations: ["水面特性を補助評価"]
      },
      verificationEvidence: { mainScenario: { headBoatNo: mainHead } },
      ...extra
    }
  };
}

const predictions = [{ predictions: [
  prediction(1, 1, { candidatePool: [{ boatNo: 5 }] }),
  prediction(2, 2, { raceScenarios: { alternateScenario: { headBoatNo: 6 } } }),
  prediction(3, 6, { raceScenarios: { alternateScenario: { headBoatNo: 5 } } }),
  prediction(4, 1, { candidatePool: [{ boatNo: 6 }], raceScenarios: { alternateScenario: { headBoatNo: 6 } } })
] }];

const results = [{ races: [
  { date: "20260830", jcd: "01", raceNo: 1, resultAvailable: true, status: "finished", trifecta: { combination: "5-1-2" } },
  { date: "20260830", jcd: "01", raceNo: 2, resultAvailable: true, status: "finished", trifecta: { combination: "6-2-1" } },
  { date: "20260830", jcd: "01", raceNo: 3, resultAvailable: true, status: "finished", trifecta: { combination: "5-6-1" } },
  { date: "20260830", jcd: "01", raceNo: 4, resultAvailable: true, status: "finished", trifecta: { combination: "1-2-3" } }
] }];

const report = x.build(predictions, results);
assert.equal(report.settledFormalEvidenceRaceCount, 4);
assert.equal(report.actualHead56Count, 3);
assert.equal(report.actualHead56CandidateCount, 1);
assert.equal(report.actualHead56ScenarioCount, 2);
assert.equal(report.actualHead56FinalAnyCount, 1);
assert.equal(report.actualHead56FinalCorrectCount, 0);
assert.equal(report.productionChanged, false);
assert.equal(report.nextStep, "continue-collecting-local-water-5-6-outcomes");

assert.equal(x.decide({
  actualHead56Count: 40,
  actualHead56CandidateCoverageRate: 90,
  actualHead56ScenarioCoverageRate: 85,
  actualHead56FinalAnyCoverageRate: 0,
  actualHead56FinalCorrectRate: 0
}), "audit-local-water-scenario-to-main-head-selection");

console.log("local water outer head stage audit test: ok");
