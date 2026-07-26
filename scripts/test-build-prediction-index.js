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
    runs: [{
      checkedAt: "2026-07-22T01:00:00Z",
      selected: true,
      collectionHealth: {
        targetCount: 1,
        savedCount: 1,
        targets: [{ raceKey: "20260722-08-1", status: "saved" }]
      }
    }],
    predictions: [{ raceKey: "20260722-08-1", selectedAt: "2026-07-22T01:00:01Z" }],
    verificationPredictions: [
      { raceKey: "20260722-08-1", selectedAt: "2026-07-22T01:00:01Z", scoreBand: "70_plus" },
      {
        raceKey: "20260722-12-1",
        selectedAt: "2026-07-22T01:00:02Z",
        scoreBand: "under_70",
        prediction: {
          raceFlow: { title: "2差し本線", oversized: "削除" },
          mainSheet: {
            honmei: { boatNo: 2, name: "本命", buffs: ["削除"] },
            tickets: [{ ticket: "2-1-3" }]
          },
          manshuSheet: { oversized: true },
          practicalTickets: [{ ticket: "2-1-3" }],
          preRaceConditions: { weather: { waveHeight: 2 } }
        }
      }
    ],
    shadowV2Predictions: [{
      recordKey: "20260722-12-1:logic-a:config-a",
      raceKey: "20260722-12-1",
      capturedAt: "2026-07-22T01:00:03Z",
      complete: true,
      calibrationEligible: true,
      evaluation: {
        totalScore: 61.2,
        components: [{
          key: "flow",
          score: 80,
          formal: true,
          reasons: ["日次だけに保持"],
          detail: {
            oversized: true
          }
        }]
      },
      versions: {
        logicFingerprint: "logic-a"
      },
      snapshot: {
        boats: [{ boatNo: 1, avgST: 0.13 }]
      },
      predictionReference: {
        practicalTickets: [{
          ticket: "1-2-3"
        }]
      }
    }]
  }));
  fs.writeFileSync(path.join(directory, "index.json"), "{}");

  const index = buildPredictionIndex(directory);
  assert.equal(index.sourceFileCount, 2);
  assert.equal(index.schemaVersion, 3);
  assert.equal(index.runs.length, 2);
  assert.equal(index.runs[0].date, "20260722");
  assert.equal(index.runs[0].collectionHealth.savedCount, 1);
  assert.equal(index.runs[0].collectionHealth.targets[0].status, "saved");
  assert.equal(index.predictions.length, 1);
  assert.equal(index.predictions[0].raceKey, "20260722-08-1");
  assert.equal(index.verificationPredictions.length, 2);
  assert.equal(index.verificationPredictions[0].raceKey, "20260722-12-1");
  assert.equal(index.verificationPredictions[0].prediction.raceFlow.title, "2差し本線");
  assert.equal(index.verificationPredictions[0].prediction.mainSheet.honmei.boatNo, 2);
  assert.equal(index.verificationPredictions[0].prediction.manshuSheet, undefined);
  assert.equal(index.verificationPredictions[0].prediction.mainSheet.tickets, undefined);
  assert.equal(index.shadowV2Predictions.length, 1);
  assert.equal(
    index.shadowV2Predictions[0].recordKey,
    "20260722-12-1:logic-a:config-a"
  );
  assert.equal(
    index.shadowV2Predictions[0].calibrationEligible,
    true
  );
  assert.equal(
    index.shadowV2Predictions[0].evaluation.totalScore,
    61.2
  );
  assert.equal(
    index.shadowV2Predictions[0].snapshot,
    undefined,
    "完全スナップショットは日次JSONだけに保持する"
  );
  assert.equal(
    index.shadowV2Predictions[0]
      .predictionReference,
    undefined
  );
  assert.equal(
    index.shadowV2Predictions[0]
      .evaluation.components[0]
      .reasons,
    undefined,
    "集約indexはV2要約だけにする"
  );
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}

console.log("自動予想索引テスト: 合格");
