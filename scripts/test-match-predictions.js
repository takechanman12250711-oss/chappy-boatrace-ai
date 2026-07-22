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
    candidatePredictions: [{
      raceKey: "20260719-01-2",
      prediction: {
        raceFlow: { title: "1逃げ本線" },
        mainSheet: { honmei: { boatNo: 1 } },
        practicalTickets: [{ ticket: "1-2-3", category: "本線" }]
      }
    }],
    shadowPredictions: [{
      raceKey: "20260719-01-3",
      prediction: {
        raceFlow: { title: "3コース攻め" },
        mainSheet: { honmei: { boatNo: 3 } },
        practicalTickets: [{ ticket: "3-1-2", category: "本線" }]
      }
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
      trifecta: { combination: "1-2-3", payout: 900, popularity: 2 }
    }, {
      jcd: "01",
      raceNo: 3,
      resultAvailable: true,
      winningMethod: "まくり",
      trifecta: { combination: "3-2-1", payout: 7200, popularity: 28 }
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
assert.equal(matched.candidateResultSummary.settledCount, 1);
assert.equal(matched.candidateResultSummary.practicalHits, 1);
assert.equal(matched.shadowResultSummary.settledCount, 1);
assert.equal(matched.shadowResultSummary.practicalHits, 0);
assert.equal(matched.shadowPredictions[0].result.missType, "着順違い");

console.log("自動予想・公式結果照合テスト: 合格");
