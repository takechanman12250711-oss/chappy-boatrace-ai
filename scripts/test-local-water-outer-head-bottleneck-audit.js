"use strict";

const assert = require("node:assert/strict");
const audit = require("./build-local-water-outer-head-bottleneck-audit");

assert.equal(audit.exactTicketHead("5-1-2"), 5);
assert.equal(audit.exactTicketHead("6-23-全"), 6);
assert.equal(audit.exactTicketHead("風速5m"), null);
assert.equal(audit.resolveStage("candidatePool[0]"), "candidate");
assert.equal(audit.resolveStage("boatEvaluation.evaluations[0]"), "candidate");
assert.equal(audit.resolveStage("aiCore.raceScenarios.alternateScenario"), "scenario");
assert.equal(audit.resolveStage("practicalTickets[0]"), "selected");
assert.equal(audit.resolveStage("verificationEvidence.mainScenario"), "final");
assert.equal(audit.conditionBand({ wind: 1, wave: 2 }), "calm");
assert.equal(audit.conditionBand({ wind: 4, wave: 2 }), "medium");
assert.equal(audit.conditionBand({ wind: 5, wave: 2 }), "strong");

function prediction(raceNo, predictionBody) {
  return {
    date: "20260830",
    jcd: "10",
    raceNo,
    prediction: {
      venueWaterSupport: {
        venue: "三国",
        wind: raceNo === 1 ? 1 : raceNo === 2 ? 4 : 6,
        wave: 2,
        confirmations: ["締切前の当地・水面特性を補助評価"]
      },
      ...predictionBody
    }
  };
}

const predictions = [{ predictions: [
  prediction(1, {
    boatEvaluation: {
      evaluations: [{ boatNo: 5, roleIntents: ["pickup"], eligiblePositions: [3], score: 72, reason: "展開拾い" }]
    },
    verificationEvidence: { mainScenario: { headBoatNo: 1 } }
  }),
  prediction(2, {
    candidatePool: [{ boatNo: 6, role: "alternate-head", eligiblePositions: [1], score: 78, reason: "外の攻め筋" }],
    verificationEvidence: { mainScenario: { headBoatNo: 2 } }
  }),
  prediction(3, {
    candidatePool: [{ boatNo: 5, role: "alternate-head", eligiblePositions: [1], score: 82 }],
    aiCore: { raceScenarios: { alternateScenario: { headBoatNo: 5 } } },
    verificationEvidence: { mainScenario: { headBoatNo: 3 } }
  }),
  prediction(4, {
    candidatePool: [{ boatNo: 6, role: "alternate-head", eligiblePositions: [1], score: 80 }],
    aiCore: { raceScenarios: { alternateScenario: { headBoatNo: 6 } } },
    practicalTickets: [{ ticket: "6-1-2", selected: true }],
    verificationEvidence: { mainScenario: { headBoatNo: 4 } }
  }),
  prediction(5, {
    candidatePool: [{ boatNo: 5, role: "alternate-head", eligiblePositions: [1], score: 88 }],
    aiCore: { raceScenarios: { alternateScenario: { headBoatNo: 5 } } },
    practicalTickets: [{ ticket: "5-1-2", selected: true }],
    verificationEvidence: { mainScenario: { headBoatNo: 5 } }
  }),
  prediction(6, {
    verificationEvidence: { mainScenario: { headBoatNo: 1 } }
  })
] }];

const results = [{ races: [
  { date: "20260830", jcd: "10", raceNo: 1, resultAvailable: true, status: "finished", trifecta: { combination: "5-1-2" } },
  { date: "20260830", jcd: "10", raceNo: 2, resultAvailable: true, status: "finished", trifecta: { combination: "6-2-1" } },
  { date: "20260830", jcd: "10", raceNo: 3, resultAvailable: true, status: "finished", trifecta: { combination: "5-3-1" } },
  { date: "20260830", jcd: "10", raceNo: 4, resultAvailable: true, status: "finished", trifecta: { combination: "6-1-3" } },
  { date: "20260830", jcd: "10", raceNo: 5, resultAvailable: true, status: "finished", trifecta: { combination: "5-2-1" } },
  { date: "20260830", jcd: "10", raceNo: 6, resultAvailable: true, status: "finished", trifecta: { combination: "6-3-1" } }
] }];

const report = audit.build(predictions, results, {
  version: "local-water-main-head-selection-audit-v1",
  nextStep: "audit-local-water-outer-head-role-generation",
  metrics: { actualHead56Count: 6 },
  classifications: {}
});

assert.equal(report.productionChanged, false);
assert.equal(report.automaticApplication, false);
assert.equal(report.actualHead56RaceCount, 6);
assert.equal(report.classifications["support-only-not-head-eligible"], 1);
assert.equal(report.classifications["candidate-head-not-promoted"], 1);
assert.equal(report.classifications["scenario-head-not-selected"], 1);
assert.equal(report.classifications["selected-head-not-final"], 1);
assert.equal(report.classifications["final-correct"], 1);
assert.equal(report.classifications["no-saved-outer-head-evidence"], 1);
assert.equal(report.actualHeadByBoat["5"], 3);
assert.equal(report.actualHeadByBoat["6"], 3);
assert.equal(report.actualHeadByConditionBand.calm, 1);
assert.equal(report.actualHeadByConditionBand.medium, 1);
assert.equal(report.actualHeadByConditionBand.strong, 4);
assert.equal(report.diagnosisFocus, "inspect-head-role-qualification-blockers");
assert.equal(report.examples.length, 6);

assert.equal(
  audit.chooseFocus("audit-local-water-outer-head-candidate-ranking", {}),
  "inspect-selected-head-ranking-blockers"
);
assert.equal(
  audit.chooseFocus("audit-local-water-main-head-ranking-and-handoff", {}),
  "inspect-main-head-ranking-handoff"
);

console.log("local water outer head bottleneck audit test: ok");
