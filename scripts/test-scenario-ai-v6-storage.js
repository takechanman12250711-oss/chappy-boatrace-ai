// scripts/test-scenario-ai-v6-storage.js
"use strict";

const assert = require("node:assert/strict");
const { attachSnapshots } = require("./build-scenario-ai-v6-snapshots");

const input = {
  verificationPredictions: [
    {
      raceKey: "20260802-01-1",
      prediction: {
        verificationEvidence: {
          scenarios: [
            { type: "escape", label: "1逃げ", score: 70, attacker: 1 },
            { type: "sashi", label: "2差し", score: 30, attacker: 2 }
          ],
          marks: {
            honmei: { boatNo: 1 },
            taikou: { boatNo: 2 },
            ana: { boatNo: 4 }
          }
        }
      }
    }
  ]
};

const output = attachSnapshots(input);
const record = output.verificationPredictions[0];
assert.equal(output.scenarioAiV6.version, "6.0.0-shadow");
assert.equal(output.scenarioAiV6.recordCount, 1);
assert.equal(output.scenarioAiV6.readyCount, 1);
assert.equal(output.scenarioAiV6.usableForPrediction, false);
assert.equal(record.scenarioAiV6Shadow.status, "shadow-ready");
assert.equal(record.scenarioAiV6Shadow.scenarios.length, 2);
assert.equal(record.scenarioAiV6Shadow.totalLikelihood, 100);
assert.equal(record.scenarioAiV6Shadow.usableForPrediction, false);
assert.equal(record.selection, undefined);

const empty = attachSnapshots({ verificationPredictions: [] });
assert.equal(empty.scenarioAiV6.recordCount, 0);
assert.equal(empty.scenarioAiV6.readyCount, 0);

console.log("展開AI v6シャドー保存テスト成功");
