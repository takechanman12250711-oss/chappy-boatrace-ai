"use strict";

const assert = require("node:assert/strict");
const audit = require("./build-local-water-outer-head-priority-score-audit");

const components = audit.parseReasonComponents(
  "最有力展開連動40/40 / 差し場・空き水面12/25 / 取得信頼度5/5"
);
assert.deepEqual(components.get("最有力展開連動"), { score: 40, maximum: 40 });
assert.deepEqual(components.get("差し場・空き水面"), { score: 12, maximum: 25 });

function prediction(raceNo, winner, final, winnerScore, finalScore, winnerReason, finalReason) {
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
      practicalSelection: {
        frameRiseFallReplayBasis: {
          raceScenarios: {
            mainScenario: {
              branches: [
                { ticket: `${winner}-1-2`, headBoatNo: winner, priorityScore: winnerScore, reason: winnerReason },
                { ticket: `${final}-1-${winner}`, headBoatNo: final, priorityScore: finalScore, reason: finalReason }
              ]
            }
          }
        }
      },
      aiCore: { raceScenarios: { alternateScenario: { headBoatNo: winner } } },
      verificationEvidence: { mainScenario: { headBoatNo: final } }
    }
  };
}

const predictions = [{ predictions: [
  prediction(
    1, 5, 2, 80, 92,
    "最有力展開連動40/40 / 差し場・空き水面12/25",
    "最有力展開連動40/40 / 差し場・空き水面24/25"
  ),
  prediction(
    2, 6, 1, 90, 85,
    "最有力展開連動40/40 / 差し場・空き水面20/25",
    "最有力展開連動40/40 / 差し場・空き水面15/25"
  ),
  prediction(
    3, 5, 3, 88, 88,
    "最有力展開連動40/40 / 差し場・空き水面18/25",
    "最有力展開連動40/40 / 差し場・空き水面18/25"
  )
] }];

const results = [{ races: [
  { date: "20260830", jcd: "10", raceNo: 1, resultAvailable: true, status: "finished", trifecta: { combination: "5-1-2" } },
  { date: "20260830", jcd: "10", raceNo: 2, resultAvailable: true, status: "finished", trifecta: { combination: "6-1-3" } },
  { date: "20260830", jcd: "10", raceNo: 3, resultAvailable: true, status: "finished", trifecta: { combination: "5-3-1" } }
] }];

const report = audit.build(predictions, results);
assert.equal(report.productionChanged, false);
assert.equal(report.metrics.unselectedScenarioHeadCount, 3);
assert.equal(report.metrics.scoreComparableCount, 3);
assert.equal(report.metrics.winnerOutscoredCount, 1);
assert.equal(report.metrics.winnerAheadCount, 1);
assert.equal(report.metrics.tiedCount, 1);
assert.equal(report.metrics.medianPositiveGap, 12);
assert.equal(report.nextStep, "continue-collecting-priority-score-evidence");
assert.equal(report.targetRaces[0].primaryComparison.gap, 12);

assert.equal(audit.chooseNextStep({
  scoreComparableCount: 27,
  winnerAheadOrTiedCount: 6,
  nearTieWithin5Count: 0,
  medianPositiveGap: 12,
  duplicateReasonShare: 90
}, null), "audit-local-water-priority-selection-consistency");

assert.equal(audit.chooseNextStep({
  scoreComparableCount: 27,
  winnerAheadOrTiedCount: 2,
  nearTieWithin5Count: 12,
  medianPositiveGap: 4,
  duplicateReasonShare: 20
}, null), "design-local-water-outer-head-tiebreak-shadow-ab");

assert.equal(audit.chooseNextStep({
  scoreComparableCount: 27,
  winnerAheadOrTiedCount: 1,
  nearTieWithin5Count: 2,
  medianPositiveGap: 12,
  duplicateReasonShare: 20
}, {
  label: "差し場・空き水面",
  count: 18,
  shareOfPositiveComponentGap: 55
}), "audit-local-water-dominant-priority-component");

console.log("local water outer head priority score audit test: ok");
