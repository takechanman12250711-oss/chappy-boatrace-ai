"use strict";

const assert = require("node:assert/strict");
const audit = require("./build-local-water-outer-head-candidate-ranking-audit");

assert.equal(audit.exactTicketHead("5-1-2"), 5);
assert.equal(audit.exactTicketHead("6-23-全"), 6);
assert.equal(audit.exactTicketHead("風速5m"), null);
assert.equal(audit.classifyReason("最大7点の上限で購入対象外"), "quota-cap");
assert.equal(audit.classifyReason("優先順位が下位"), "score-rank");
assert.equal(audit.resolveStage("practicalSelection.targetDecisions[0].candidateDecisions[1]"), "candidate");
assert.equal(audit.resolveStage("aiCore.raceScenarios.alternateScenario"), "scenario");
assert.equal(audit.resolveStage("practicalSelection.targetDecisions[0].bestCandidateTicket"), "selected");

function prediction(raceNo, predictionData) {
  return {
    date: "20260830",
    jcd: "10",
    raceNo,
    prediction: {
      venueWaterSupport: {
        venue: "三国",
        wind: 4,
        wave: 3,
        confirmations: ["締切前の当地・水面特性を補助評価"]
      },
      ...predictionData
    }
  };
}

const predictions = [{ predictions: [
  prediction(1, {
    practicalSelection: {
      targetDecisions: [{
        candidateDecisions: [
          { ticket: "5-1-2", roleLabels: ["alternate-head"], selectionScore: 70 },
          { ticket: "2-1-5", roleLabels: ["head"], selectionScore: 85 }
        ]
      }]
    },
    aiCore: { raceScenarios: { alternateScenario: { headBoatNo: 5 } } },
    verificationEvidence: { mainScenario: { headBoatNo: 2 } }
  }),
  prediction(2, {
    practicalSelection: {
      targetDecisions: [{
        candidateDecisions: [
          {
            ticket: "6-1-3",
            roleLabels: ["alternate-head"],
            status: "最大7点の上限で購入対象外"
          }
        ]
      }]
    },
    aiCore: { raceScenarios: { alternateScenario: { headBoatNo: 6 } } },
    verificationEvidence: { mainScenario: { headBoatNo: 1 } }
  }),
  prediction(3, {
    practicalSelection: {
      targetDecisions: [{
        candidateDecisions: [{ ticket: "5-2-1", roleLabels: ["head"] }],
        bestCandidateTicket: "5-2-1"
      }]
    },
    aiCore: { raceScenarios: { alternateScenario: { headBoatNo: 5 } } },
    verificationEvidence: { mainScenario: { headBoatNo: 1 } }
  }),
  prediction(4, {
    aiCore: { raceScenarios: { alternateScenario: { headBoatNo: 6 } } },
    verificationEvidence: { mainScenario: { headBoatNo: 3 } }
  })
] }];

const results = [{ races: [
  { date: "20260830", jcd: "10", raceNo: 1, resultAvailable: true, status: "finished", trifecta: { combination: "5-1-2" } },
  { date: "20260830", jcd: "10", raceNo: 2, resultAvailable: true, status: "finished", trifecta: { combination: "6-1-3" } },
  { date: "20260830", jcd: "10", raceNo: 3, resultAvailable: true, status: "finished", trifecta: { combination: "5-2-1" } },
  { date: "20260830", jcd: "10", raceNo: 4, resultAvailable: true, status: "finished", trifecta: { combination: "6-3-1" } }
] }];

const report = audit.build(predictions, results);
assert.equal(report.productionChanged, false);
assert.equal(report.automaticApplication, false);
assert.equal(report.metrics.actualHead56Count, 4);
assert.equal(report.metrics.scenarioHeadCount, 4);
assert.equal(report.metrics.selectedHeadCount, 1);
assert.equal(report.metrics.unselectedScenarioHeadCount, 3);
assert.equal(report.metrics.scoreComparableCount, 1);
assert.equal(report.metrics.winnerOutscoredCount, 1);
assert.equal(report.metrics.quotaCapRejectionCount, 1);
assert.equal(report.metrics.missingStructuredReasonCount, 1);
assert.equal(report.classifications["score-rank-loss"], 1);
assert.equal(report.classifications["quota-cap-rejection"], 1);
assert.equal(report.classifications["selected-head-lost-at-final-handoff"], 1);
assert.equal(report.classifications["scenario-head-unselected-no-structured-reason"], 1);
assert.equal(report.nextStep, "continue-collecting-evidence");

assert.equal(audit.chooseNextStep({
  actualHead56Count: 40,
  unselectedScenarioHeadCount: 27,
  selectedThenFinalDroppedCount: 12,
  structuredRankingCoverageRate: 40,
  quotaCapShareOfUnselected: 0,
  scoreComparableCount: 0,
  winnerOutscoredRate: 0,
  scoreRankShareOfUnselected: 0,
  duplicateShareOfUnselected: 0
}), "improve-local-water-outer-head-ranking-observability");

assert.equal(audit.chooseNextStep({
  actualHead56Count: 40,
  unselectedScenarioHeadCount: 27,
  selectedThenFinalDroppedCount: 12,
  structuredRankingCoverageRate: 100,
  quotaCapShareOfUnselected: 60,
  scoreComparableCount: 0,
  winnerOutscoredRate: 0,
  scoreRankShareOfUnselected: 0,
  duplicateShareOfUnselected: 0
}), "audit-local-water-ticket-quota-allocation");

assert.equal(audit.chooseNextStep({
  actualHead56Count: 40,
  unselectedScenarioHeadCount: 5,
  selectedThenFinalDroppedCount: 12,
  structuredRankingCoverageRate: 100,
  quotaCapShareOfUnselected: 0,
  scoreComparableCount: 0,
  winnerOutscoredRate: 0,
  scoreRankShareOfUnselected: 0,
  duplicateShareOfUnselected: 0
}), "audit-local-water-main-head-handoff");

console.log("local water outer head candidate ranking audit test: ok");
