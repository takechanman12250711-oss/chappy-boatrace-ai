"use strict";

const assert = require("node:assert/strict");
const {
  MIN_SCORE,
  compactStoredVerification,
  upsertByRaceKey
} = require("./collect-predictions");

assert.equal(MIN_SCORE, 70);

const records = upsertByRaceKey(
  [
    { raceKey: "20260722-08-1", selectedAt: "old", scoreBand: "under_70" },
    { raceKey: "20260722-12-1", selectedAt: "kept", scoreBand: "under_70" }
  ],
  [
    { raceKey: "20260722-08-1", selectedAt: "new", scoreBand: "70_plus" },
    { raceKey: "20260722-19-1", selectedAt: "added", scoreBand: "under_70" }
  ]
);

assert.equal(records.length, 3);
assert.equal(records.find(item => item.raceKey === "20260722-08-1").selectedAt, "new");
assert.equal(records.find(item => item.raceKey === "20260722-12-1").selectedAt, "kept");
assert.equal(records.find(item => item.raceKey === "20260722-19-1").scoreBand, "under_70");

const compacted = compactStoredVerification({
  raceKey: "20260722-19-1",
  result: { settled: true },
  prediction: {
    version: "test",
    predictionMode: "server_pre_deadline_shadow",
    raceFlow: { title: "1逃げ本線", summary: "要約", oversized: "削除" },
    mainSheet: {
      honmei: { boatNo: 1, name: "本命", buffs: ["大きな分析"] },
      taikou: { boatNo: 2, name: "対抗" },
      tickets: Array.from({ length: 30 }, () => ({ ticket: "1-2-3" }))
    },
    manshuSheet: { oversized: true },
    ticketRanks: Array.from({ length: 30 }, () => ({ ticket: "1-2-3" })),
    practicalTickets: [{ ticket: "1-2-3", category: "本線" }],
    preRaceConditions: { weather: { windSpeed: 3 } }
  }
});

assert.equal(compacted.result.settled, true);
assert.equal(compacted.prediction.raceFlow.title, "1逃げ本線");
assert.equal(compacted.prediction.mainSheet.honmei.boatNo, 1);
assert.equal(compacted.prediction.practicalTickets.length, 1);
assert.equal(compacted.prediction.preRaceConditions.weather.windSpeed, 3);
assert.equal(compacted.prediction.manshuSheet, undefined);
assert.equal(compacted.prediction.ticketRanks, undefined);
assert.equal(compacted.prediction.mainSheet.tickets, undefined);

console.log("シャドー予想保存テスト: 合格");
