"use strict";

const assert = require("node:assert/strict");
const audit = require("./build-local-water-main-head-selection-audit");

assert.equal(audit.exactTicketHead("5-1-2"), 5);
assert.equal(audit.exactTicketHead("6-23-全"), 6);
assert.equal(audit.exactTicketHead("風速5m"), null);
assert.equal(audit.resolveStage("candidatePool[0]"), "candidate");
assert.equal(audit.resolveStage("aiCore.raceScenarios.alternateScenario"), "scenario");
assert.equal(audit.resolveStage("verificationEvidence.mainScenario"), "final");

function prediction(raceNo, prediction) {
  return { date: "20260830", jcd: "10", raceNo, prediction: {
    venueWaterSupport: {
      venue: "三国",
      wind: 4,
      wave: 3,
      confirmations: ["締切前の当地・水面特性を補助評価"]
    },
    ...prediction
  } };
}

const predictions = [{ predictions: [
  prediction(1, {
    candidatePool: [{ boatNo: 5, role: "alternate-head" }],
    aiCore: { raceScenarios: { alternateScenario: { headBoatNo: 5 } } },
    verificationEvidence: { mainScenario: { headBoatNo: 1 } }
  }),
  prediction(2, {
    candidatePool: [{ boatNo: 6, role: "pickup", eligiblePositions: [3] }],
    aiCore: { raceScenarios: { mainScenario: { headBoatNo: 2, outcome: { thirdCandidates: [6] } } } },
    verificationEvidence: { mainScenario: { headBoatNo: 2 } }
  }),
  prediction(3, {
    candidatePool: [{ boatNo: 5, role: "alternate-head" }],
    aiCore: { raceScenarios: { mainScenario: { headBoatNo: 2 } } },
    verificationEvidence: { mainScenario: { headBoatNo: 2 } }
  }),
  prediction(4, {
    candidatePool: [{ boatNo: 6, roleIntents: ["head"], eligiblePositions: [1] }],
    aiCore: { raceScenarios: { mainScenario: { headBoatNo: 6 } } },
    verificationEvidence: { mainScenario: { headBoatNo: 6 } }
  })
] }];

const results = [{ races: [
  { date: "20260830", jcd: "10", raceNo: 1, resultAvailable: true, status: "finished", trifecta: { combination: "5-1-2" } },
  { date: "20260830", jcd: "10", raceNo: 2, resultAvailable: true, status: "finished", trifecta: { combination: "6-2-1" } },
  { date: "20260830", jcd: "10", raceNo: 3, resultAvailable: true, status: "finished", trifecta: { combination: "5-3-1" } },
  { date: "20260830", jcd: "10", raceNo: 4, resultAvailable: true, status: "finished", trifecta: { combination: "6-1-3" } }
] }];

const report = audit.build(predictions, results);
assert.equal(report.productionChanged, false);
assert.equal(report.automaticApplication, false);
assert.equal(report.metrics.actualHead56Count, 4);
assert.equal(report.metrics.candidateActualHeadCount, 3);
assert.equal(report.metrics.scenarioActualHeadCount, 2);
assert.equal(report.metrics.finalCorrectCount, 1);
assert.equal(report.classifications["scenario-head-not-selected"], 1);
assert.equal(report.classifications["support-only-not-head-eligible"], 1);
assert.equal(report.classifications["candidate-head-not-promoted"], 1);
assert.equal(report.classifications["final-correct"], 1);
assert.equal(report.nextStep, "continue-collecting-evidence");

assert.equal(audit.chooseNextStep({
  actualHead56Count: 40,
  candidateActualCoverageRate: 30,
  scenarioActualCoverageRate: 30,
  selectedActualCoverageRate: 0,
  finalCorrectRate: 0
}), "audit-local-water-outer-head-role-generation");

assert.equal(audit.chooseNextStep({
  actualHead56Count: 40,
  candidateActualCoverageRate: 100,
  scenarioActualCoverageRate: 100,
  selectedActualCoverageRate: 0,
  finalCorrectRate: 0
}), "audit-local-water-outer-head-candidate-ranking");

assert.equal(audit.chooseNextStep({
  actualHead56Count: 40,
  candidateActualCoverageRate: 100,
  scenarioActualCoverageRate: 100,
  selectedActualCoverageRate: 100,
  finalCorrectRate: 0
}), "audit-local-water-main-head-ranking-and-handoff");

console.log("local water main-head selection audit test: ok");
