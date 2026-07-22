"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildPredictionIndex } = require("./build-prediction-index");

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "chappy-prediction-index-"));

try {
  fs.writeFileSync(path.join(directory, "20260721.json"), JSON.stringify({
    date: "20260721",
    runs: [{ checkedAt: "2026-07-21T01:00:00Z", selected: false }],
    predictions: []
  }));
  fs.writeFileSync(path.join(directory, "20260722.json"), JSON.stringify({
    date: "20260722",
    runs: [{ checkedAt: "2026-07-22T01:00:00Z", selected: true }],
    predictions: [{ raceKey: "20260722-08-1", selectedAt: "2026-07-22T01:00:01Z" }],
    candidatePredictions: [{ raceKey: "20260722-08-2", capturedAt: "2026-07-22T01:00:02Z" }],
    shadowPredictions: [{ raceKey: "20260722-08-3", capturedAt: "2026-07-22T01:00:03Z" }]
  }));
  fs.writeFileSync(path.join(directory, "index.json"), "{}");

  const index = buildPredictionIndex(directory);
  assert.equal(index.sourceFileCount, 2);
  assert.equal(index.runs.length, 2);
  assert.equal(index.runs[0].date, "20260722");
  assert.equal(index.predictions.length, 1);
  assert.equal(index.predictions[0].raceKey, "20260722-08-1");
  assert.equal(index.candidatePredictions.length, 1);
  assert.equal(index.candidatePredictions[0].raceKey, "20260722-08-2");
  assert.equal(index.shadowPredictions.length, 1);
  assert.equal(index.shadowPredictions[0].raceKey, "20260722-08-3");
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}

console.log("自動予想索引テスト: 合格");
