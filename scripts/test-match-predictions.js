// scripts/test-match-predictions.js
"use strict";

const assert = require("node:assert/strict");
const {
  normalizeTicket,
  classifyMiss,
  matchPredictions
} = require("./match-predictions");

assert.equal(normalizeTicket("2→1→4"), "2-1-4");
assert.equal(classifyMiss(["2-1-4"], "2-1-4"), "的中");
assert.equal(classifyMiss(["1-2-4"], "2-1-4"), "頭外れ");
assert.equal(classifyMiss(["2-4-1"], "2-1-4"), "着順違い");
assert.equal(classifyMiss(["2-1-5"], "2-1-4"), "相手抜け");
assert.equal(classifyMiss(["2-5-6"], "2-1-4"), "完全抜け");

const matched = matchPredictions(
  {
    date: "20260719",
    predictions: [{
      raceKey: "20260719-01-1",
      prediction: {
        raceFlow: { title: "2差し本線" },
        mainSheet: { honmei: { boatNo: 2 } },
        practicalTickets: [{ ticket: "2-1-4", category: "本線" }]
      }
    }],
    verificationPredictions: [{
      raceKey: "20260719-01-1",
      scoreBand: "70_plus",
      selection: { score: 74 },
      prediction: {
        raceFlow: { title: "2差し本線" },
        mainSheet: { honmei: { boatNo: 2 } },
        practicalTickets: [{ ticket: "2-1-4", category: "本線" }]
      }
    }, {
      raceKey: "20260719-01-2",
      scoreBand: "under_70",
      selection: { score: 58 },
      prediction: {
        raceFlow: { title: "1逃げ本線" },
        mainSheet: { honmei: { boatNo: 1 } },
        practicalTickets: [{ ticket: "1-2-3", category: "本線" }]
      }
    }],
    shadowV2Predictions: [{
      recordKey: "20260719-01-1:logic-a:config-a",
      raceKey: "20260719-01-1",
      capturedAt: "2026-07-19T01:00:00Z",
      calibrationEligible: true,
      evaluation: {
        totalScore: 61.2
      },
      officialResultUsedForEvaluation: false
    }]
  },
  {
    date: "20260719",
    races: [{
      jcd: "01",
      raceNo: 1,
      resultAvailable: true,
      winningMethod: "差し",
      trifecta: {
        combination: "2-1-4",
        payout: 4080,
        popularity: 14
      }
    }, {
      jcd: "01",
      raceNo: 2,
      resultAvailable: true,
      winningMethod: "逃げ",
      trifecta: {
        combination: "1-3-2",
        payout: 1250,
        popularity: 5
      }
    }]
  }
);

assert.equal(matched.resultSummary.settledCount, 1);
assert.equal(matched.resultSummary.practicalHits, 1);
assert.equal(matched.predictions[0].result.practicalHit, true);
assert.equal(matched.predictions[0].result.payout, 4080);
assert.equal(matched.predictions[0].result.scenarioMatched, true);
assert.equal(matched.predictions[0].result.hitCategory, "本線");
assert.equal(matched.predictions[0].result.priorityReview.primaryStage, "的中");
assert.equal(matched.predictions[0].result.verification.marks[0].finishLabel, "1着");
assert.equal(matched.resultSummary.scenarioMatchRate, 100);
assert.equal(matched.resultSummary.simulatedStake, 100);
assert.equal(matched.resultSummary.simulatedReturn, 4080);
assert.equal(matched.verificationPredictions.length, 2);
assert.equal(matched.verificationResultSummary.score70Plus.settledCount, 1);
assert.equal(matched.verificationResultSummary.under70.settledCount, 1);
assert.equal(matched.verificationResultSummary.under70.practicalHits, 0);
assert.deepEqual(
  matched.shadowV2Predictions,
  [{
    recordKey: "20260719-01-1:logic-a:config-a",
    raceKey: "20260719-01-1",
    capturedAt: "2026-07-19T01:00:00Z",
    calibrationEligible: true,
    evaluation: {
      totalScore: 61.2
    },
    officialResultUsedForEvaluation: false
  }],
  "V2シャドーは現行の結果照合から独立して保持する"
);

console.log("自動予想・公式結果照合テスト: 合格");
