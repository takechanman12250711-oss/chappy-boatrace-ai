"use strict";

const assert = require("node:assert/strict");
const { normalizeIndex } = require("../js/auto-stats");

const normalized = normalizeIndex({
  runs: [{ selected: true }],
  predictions: [{
    raceKey: "20260722-08-1",
    date: "20260722",
    jcd: "08",
    place: "常滑",
    raceNo: 1,
    selectedAt: "2026-07-22T01:00:00Z",
    prediction: { ticketRanks: [{ ticket: "1-2-3", role: "本命" }] },
    result: {
      settled: true,
      resultTicket: "1→2→3",
      payout: 1230,
      popularity: 4,
      winningMethod: "逃げ",
      verification: {
        scenarioMatched: true,
        hitCategory: "本線"
      }
    }
  }],
  candidatePredictions: [{
    raceKey: "20260722-08-2",
    capturedAt: "2026-07-22T01:01:00Z",
    selection: { score: 71 },
    prediction: { ticketRanks: [] }
  }],
  shadowPredictions: [{
    raceKey: "20260722-08-3",
    capturedAt: "2026-07-22T01:02:00Z",
    selection: { score: 63 },
    prediction: { practicalTickets: [{ ticket: "1-2-3" }] },
    result: {
      settled: true,
      resultTicket: "1-3-2",
      verification: { practicalHit: false, missType: "着順違い" }
    }
  }]
});

assert.equal(normalized.predictions.length, 1);
assert.equal(normalized.predictions[0].predictionSource, "automatic");
assert.equal(normalized.results[0].result, "1-2-3");
assert.equal(normalized.results[0].officialPayoutPer100, 1230);
assert.equal(normalized.results[0].automaticVerification.scenarioMatched, true);
assert.equal(normalized.results[0].automaticVerification.hitCategory, "本線");
assert.equal(normalized.runs.length, 1);
assert.equal(normalized.candidatePredictions.length, 1);
assert.equal(normalized.candidatePredictions[0].predictionSource, "automatic_candidate");
assert.equal(normalized.shadowPredictions.length, 1);
assert.equal(normalized.shadowPredictions[0].predictionSource, "automatic_shadow");
assert.equal(normalized.shadowPredictions[0].automaticSelection.score, 63);
assert.equal(normalized.shadowResults.length, 1);

console.log("自動予想成績変換テスト: 合格");
