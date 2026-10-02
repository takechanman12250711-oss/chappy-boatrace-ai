"use strict";
const assert = require("node:assert/strict");
const x = require("./build-outer-head-drop-stage-audit");

const candidateRecord = {
  date: "20260830",
  jcd: "01",
  raceNo: 1,
  prediction: {
    verificationEvidence: { mainScenario: { headBoatNo: 1 } },
    candidatePool: [{ boatNo: 5, role: "alternate-head" }]
  }
};

const scenarioRecord = {
  date: "20260830",
  jcd: "01",
  raceNo: 2,
  prediction: {
    verificationEvidence: { mainScenario: { headBoatNo: 2 } },
    raceScenarios: { alternateScenario: { headBoatNo: 6 } }
  }
};

const nestedCandidateRecord = {
  date: "20260830",
  jcd: "01",
  raceNo: 3,
  prediction: {
    raceScenarios: {
      mainScenario: { headBoatNo: 1 },
      candidatePool: [{ boatNo: 6 }]
    }
  }
};

assert.deepEqual(x.inspect(candidateRecord), {
  candidate56: true,
  scenario56: false,
  paths: ["candidatePool"]
});
assert.deepEqual(x.inspect(scenarioRecord), {
  candidate56: false,
  scenario56: true,
  paths: ["raceScenarios", "raceScenarios.alternateScenario"]
});

const nested = x.inspect(nestedCandidateRecord);
assert.equal(nested.candidate56, true);
assert.equal(nested.scenario56, false);

const report = x.build([{ predictions: [candidateRecord, scenarioRecord] }]);
assert.equal(report.settledPredictionCount, 2);
assert.equal(report.finalHead56Count, 0);
assert.equal(report.candidateStage56RaceCount, 1);
assert.equal(report.scenarioStage56RaceCount, 1);
assert.equal(report.dropStage, "drops-between-scenario-and-main-head");
assert.equal(report.productionChanged, false);
console.log("outer head drop stage audit test: ok");
