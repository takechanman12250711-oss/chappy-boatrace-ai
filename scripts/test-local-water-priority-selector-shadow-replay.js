"use strict";

const assert = require("node:assert/strict");
const shadow = require("./build-local-water-priority-selector-shadow-replay");

function candidate(boatNo, priorityScore, extra = {}) {
  return {
    headBoatNo: boatNo,
    ticket: `${boatNo}-1-2`,
    roleLabels: ["alternate-head"],
    eligiblePositions: [1],
    priorityScore,
    ...extra
  };
}

function prediction(raceNo, currentHead, candidates = null) {
  const predictionValue = {
    venueWaterSupport: {
      venue: "テスト水面",
      wind: 2,
      wave: 1,
      statements: ["水面確認済み"]
    },
    verificationEvidence: {
      mainScenario: { headBoatNo: currentHead }
    }
  };
  if (candidates) {
    predictionValue.practicalSelection = {
      frameRiseFallReplayBasis: {
        raceScenarios: {
          mainScenario: { branches: candidates }
        }
      }
    };
  }
  return {
    date: "20260830",
    jcd: "10",
    raceNo,
    prediction: predictionValue
  };
}

function result(raceNo, actualHead) {
  const second = actualHead === 1 ? 2 : 1;
  const third = [1, 2, 3, 4, 5, 6].find((boatNo) => boatNo !== actualHead && boatNo !== second);
  return {
    date: "20260830",
    jcd: "10",
    raceNo,
    resultAvailable: true,
    status: "finished",
    trifecta: { combination: `${actualHead}-${second}-${third}` }
  };
}

const records = [
  prediction(1, 2, [candidate(2, 80), candidate(6, 95)]),
  prediction(2, 4, [candidate(4, 73), candidate(6, 87)]),
  prediction(3, 2, [candidate(2, 80), candidate(6, 80)]),
  prediction(4, 1, [candidate(1, 90), candidate(5, 80)]),
  prediction(5, 3, [candidate(3, 70), candidate(5, 80)]),
  prediction(6, 1, null)
];
const results = [
  result(1, 6),
  result(2, 6),
  result(3, 6),
  result(4, 1),
  result(5, 3),
  result(6, 1)
];
const source = {
  version: "local-water-priority-selection-consistency-audit-v1",
  generatedAt: "2026-08-30T00:00:00.000Z",
  nextStep: "build-local-water-priority-selector-shadow-replay"
};

const ranking = shadow.candidateRanking(records[0].prediction);
assert.equal(ranking.available, true);
assert.equal(ranking.best.boatNo, 6);
assert.equal(ranking.best.score, 95);
assert.equal(ranking.byBoat.get(2).score, 80);

const tieReplay = shadow.replayRace(records[2], results[2]);
assert.equal(tieReplay.comparable, true);
assert.equal(tieReplay.equalTopOtherBoat, true);
assert.equal(tieReplay.switched, false);
assert.equal(tieReplay.shadowHead, 2);

const report = shadow.build(
  [{ predictions: records }],
  [{ races: results }],
  source
);
assert.equal(report.productionChanged, false);
assert.equal(report.automaticApplication, false);
assert.equal(report.usableForPrediction, false);
assert.equal(report.shadowRule.resultUsedForSelection, false);
assert.equal(report.applicable, true);
assert.equal(report.metrics.settledFormalEvidenceRaceCount, 6);
assert.equal(report.metrics.currentHeadAvailableCount, 6);
assert.equal(report.metrics.rankingArrayAvailableCount, 5);
assert.equal(report.metrics.comparableReplayCount, 5);
assert.equal(report.metrics.switchCount, 3);
assert.equal(report.metrics.equalTopOtherBoatNoSwitchCount, 1);
assert.equal(report.metrics.currentCorrectCount, 3);
assert.equal(report.metrics.shadowCorrectCount, 4);
assert.equal(report.metrics.netCorrectChange, 1);
assert.equal(report.metrics.wrongToCorrectCount, 2);
assert.equal(report.metrics.correctToWrongCount, 1);
assert.equal(report.metrics.rescuedOuterWinnerCount, 2);
assert.equal(report.metrics.falseOuterPromotionCount, 1);
assert.equal(report.metrics.falseOuterPromotionsPerRescuedOuterWinner, 0.5);
assert.equal(report.switchTransitions["2->6"], 1);
assert.equal(report.switchTransitions["4->6"], 1);
assert.equal(report.switchTransitions["3->5"], 1);
assert.equal(report.outcomeCounts["wrong-to-correct"], 2);
assert.equal(report.outcomeCounts["correct-to-wrong"], 1);
assert.equal(report.conditionBands[0].conditionBand, "calm");
assert.equal(report.conditionBands[0].raceCount, 6);

const passMetrics = {
  settledFormalEvidenceRaceCount: 370,
  currentHeadCoverageRate: 100,
  comparableReplayCount: 300,
  comparableReplayCoverageRate: 81.1,
  switchCount: 2,
  netCorrectChange: 2,
  rescuedOuterWinnerCount: 2,
  correctToWrongCount: 0,
  wrongToCorrectCount: 2,
  accuracyChangePt: 0.5,
  falseOuterPromotionsPerRescuedOuterWinner: 0,
  outerPromotionRaceRate: 0.5
};
const safeBands = [{ conditionBand: "calm", raceCount: 300, accuracyChangePt: 0.5 }];
assert.equal(
  shadow.decideNextStep({ applicable: true, metrics: passMetrics, conditionBands: safeBands }).nextStep,
  "prepare-local-water-priority-selector-forward-shadow-ab"
);

assert.equal(
  shadow.decideNextStep({
    applicable: true,
    metrics: {
      ...passMetrics,
      netCorrectChange: -1,
      correctToWrongCount: 3,
      wrongToCorrectCount: 2,
      accuracyChangePt: -0.3
    },
    conditionBands: safeBands
  }).nextStep,
  "reject-local-water-priority-selector-shadow-rule"
);

assert.equal(
  shadow.decideNextStep({
    applicable: false,
    metrics: passMetrics,
    conditionBands: safeBands
  }).nextStep,
  "follow-priority-selection-consistency-next-step"
);

console.log("local water priority selector shadow replay test: ok");
