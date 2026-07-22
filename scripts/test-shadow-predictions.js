"use strict";

const assert = require("node:assert/strict");
const {
  MIN_SCORE,
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

console.log("シャドー予想保存テスト: 合格");
