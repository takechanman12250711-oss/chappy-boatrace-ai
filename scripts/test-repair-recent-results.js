// scripts/test-repair-recent-results.js
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  normalizeDateKey,
  getRecentDateKeys,
  isCompleteResultFile,
  hasUnsettledPredictions
} = require("./repair-recent-results");

assert.equal(normalizeDateKey("2026-07-22"), "20260722");
assert.deepEqual(
  getRecentDateKeys("20260301"),
  ["20260227", "20260228", "20260301"]
);

const tempDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), "repair-recent-results-")
);
const resultPath = path.join(tempDirectory, "20260720.json");
const predictionPath = path.join(tempDirectory, "predictions.json");

fs.writeFileSync(resultPath, JSON.stringify({
  source: "boatrace-official",
  date: "20260720",
  raceCount: 156,
  completedRaces: 156,
  pendingRaces: 0,
  failedRaces: 0,
  complete: true
}));
assert.equal(isCompleteResultFile(resultPath, "20260720"), true);

fs.writeFileSync(resultPath, JSON.stringify({
  source: "boatrace-official",
  date: "20260720",
  raceCount: 156,
  completedRaces: 0,
  pendingRaces: 156,
  failedRaces: 0,
  complete: false
}));
assert.equal(isCompleteResultFile(resultPath, "20260720"), false);

fs.writeFileSync(predictionPath, JSON.stringify({
  predictions: [],
  verificationPredictions: [
    { raceKey: "20260720-24-11" }
  ]
}));
assert.equal(hasUnsettledPredictions(predictionPath), true);

fs.writeFileSync(predictionPath, JSON.stringify({
  predictions: [
    {
      raceKey: "20260720-24-11",
      result: { settled: true }
    }
  ],
  verificationPredictions: []
}));
assert.equal(hasUnsettledPredictions(predictionPath), false);

fs.rmSync(tempDirectory, { recursive: true, force: true });

console.log("直近3日間の結果自動復旧・予想照合テストに合格しました");
