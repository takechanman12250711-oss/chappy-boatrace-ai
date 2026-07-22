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
  verificationPredictions: [{
    raceKey: "20260722-08-1",
    selection: { score: 72 },
    prediction: {}
  }, {
    raceKey: "20260722-12-2",
    date: "20260722",
    jcd: "12",
    place: "住之江",
    raceNo: 2,
    selectedAt: "2026-07-22T01:01:00Z",
    scoreBand: "under_70",
    selection: { score: 58, threshold: 70, qualified: false },
    prediction: { practicalTickets: [{ ticket: "1-2-3", category: "本線" }] },
    result: {
      settled: true,
      resultTicket: "1-3-2",
      payout: 980,
      verification: { scenarioMatched: false, practicalHit: false }
    }
  }]
});

assert.equal(normalized.predictions.length, 2);
assert.equal(normalized.predictions[0].predictionSource, "automatic");
assert.equal(normalized.predictions[1].predictionSource, "automatic_shadow");
assert.equal(normalized.predictions[1].scoreBand, "under_70");
assert.equal(normalized.results[0].result, "1-2-3");
assert.equal(normalized.results[0].officialPayoutPer100, 1230);
assert.equal(normalized.results[0].automaticVerification.scenarioMatched, true);
assert.equal(normalized.results[0].automaticVerification.hitCategory, "本線");
assert.equal(normalized.runs.length, 1);
assert.equal(normalized.selectedCount, 1);
assert.equal(normalized.shadowCount, 1);

console.log("自動予想成績変換テスト: 合格");
