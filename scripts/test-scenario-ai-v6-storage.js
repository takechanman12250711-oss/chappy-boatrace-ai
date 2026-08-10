// scripts/test-scenario-ai-v6-storage.js
"use strict";

const assert = require("node:assert/strict");
const { attachSnapshots } = require("./build-scenario-ai-v6-snapshots");
const { compactVerificationEvidence } = require("./collect-predictions");
const scenarioAiV6 = require("../js/scenario-ai-v6-shadow");
const scenarioAiV6ShadowAb = require("../js/scenario-ai-v6-shadow-ab");

const input = {
  verificationPredictions: [
    {
      raceKey: "20260802-01-1",
      scenarioLikelihoodV5: {
        scenarios: [
          { key: "escape", label: "1逃げ", score: 70 },
          { key: "sashi", label: "2差し", score: 30 }
        ]
      },
      prediction: {
        verificationEvidence: {
          mainScenario: { type: "escape", label: "1逃げ", headBoatNo: 1 },
          tickets: [{ ticket: "1-2-4" }, { ticket: "2-1-4" }]
        },
        mainSheet: {
          honmei: { boatNo: 1 },
          taikou: { boatNo: 2 },
          ana: { boatNo: 4 }
        }
      }
    }
  ]
};

const output = attachSnapshots(input);
const record = output.verificationPredictions[0];
assert.equal(output.scenarioAiV6.version, "6.1.0-shadow");
assert.equal(output.scenarioAiV6.logicFingerprint, scenarioAiV6.LOGIC_FINGERPRINT);
assert.equal(output.scenarioAiV6.recordCount, 1);
assert.equal(output.scenarioAiV6.readyCount, 1);
assert.equal(output.scenarioAiV6.usableForPrediction, false);
assert.equal(record.scenarioAiV6Shadow.status, "shadow-ready");
assert.equal(record.scenarioAiV6Shadow.scenarios.length, 2);
assert.equal(record.scenarioAiV6Shadow.totalLikelihood, 100);
assert.equal(record.scenarioAiV6Shadow.usableForPrediction, false);
assert.equal(record.selection, undefined);

const compacted = compactVerificationEvidence({
  practicalSelection: {
    verificationEvidence: {
      mainScenario: { type: "escape", label: "1逃げ", headBoatNo: 1 },
      roleClaims: [{ role: "attack", boatNo: 1 }],
      tickets: [{ ticket: "1-2-4" }]
    }
  },
  aiCore: {
    raceScenarios: {
      mainScenario: { type: "escape", label: "1逃げ", score: 70, attacker: 1 },
      subScenario: { type: "sashi", label: "2差し", score: 30, attacker: 2 },
      scenarios: [
        { type: "escape", label: "1逃げ", score: 70, attacker: 1 },
        { type: "sashi", label: "2差し", score: 30, attacker: 2 },
        { type: "threeAttack", label: "3攻め", score: 20, attacker: 3 },
        { type: "fourAttack", label: "4攻め", score: 10, attacker: 4 }
      ]
    },
    marks: {
      honmei: { boatNo: 1 },
      taikou: { boatNo: 2 },
      ana: { boatNo: 4 }
    }
  }
});
assert.equal(compacted.scenarios.length, 4, "実戦選択の証拠を保ったまま正式な複数展開を保存する");
assert.equal(compacted.roleClaims.length, 1);
assert.equal(compacted.tickets.length, 1);

const canonicalFallback = attachSnapshots({
  verificationPredictions: [{
    raceKey: "20260802-01-2",
    scenarioLikelihoodV5: {
      scenarios: [
        { key: "canonical-evaluated-scenario", label: "正式評価", score: 99 },
        { key: "escape", label: "1逃げ", score: 70 },
        { key: "threeAttack", label: "3攻め", score: 50 },
        { key: "fourAttack", label: "4攻め", score: 40 },
        { key: "sashi", label: "2差し", score: 30 }
      ]
    },
    prediction: {
      verificationEvidence: {
        mainScenario: { type: "escape", label: "1逃げ", headBoatNo: 1 }
      },
      mainSheet: {
        honmei: { boatNo: 1 },
        taikou: { boatNo: 2 },
        ana: { boatNo: 4 }
      }
    }
  }]
});
assert.deepEqual(
  new Set(canonicalFallback.verificationPredictions[0].scenarioAiV6Shadow.scenarios.map(row => row.scenarioType)),
  new Set(["escape", "sashi", "threeAttack", "fourAttack"]),
  "旧v5の正式評価行を除外して4標準展開をすべて保持する"
);

const trainingReport = {
  generatedAt: "2026-08-01T12:00:00.000Z",
  trainingCohort: {
    fingerprint: "training-c1",
    trainedThrough: "2026-08-01T00:00:00.000Z",
    inputSourceKind: "stored-v5-pre-race"
  },
  approvalGate: {
    approvedCandidates: [
      { approved: true, scope: "scenario-type", key: "sashi", adjustment: -2 }
    ]
  }
};
const captured = attachSnapshots({
  verificationPredictions: [{
    ...input.verificationPredictions[0],
    selectedAt: "2026-08-02T00:00:00.000Z"
  }]
}, scenarioAiV6.build, scenarioAiV6ShadowAb.build, trainingReport);
const capturedRecord = captured.verificationPredictions[0];
const frozenShadow = JSON.stringify(capturedRecord.scenarioAiV6Shadow);
const frozenAb = JSON.stringify(capturedRecord.scenarioAiV6ShadowAb);
const replacementReport = {
  generatedAt: "2026-08-03T12:00:00.000Z",
  trainingCohort: {
    fingerprint: "training-c2",
    trainedThrough: "2026-08-03T00:00:00.000Z",
    inputSourceKind: "stored-v5-pre-race"
  },
  approvalGate: {
    approvedCandidates: [
      { approved: true, scope: "scenario-type", key: "escape", adjustment: 2 }
    ]
  }
};
const preRaceRerun = attachSnapshots({
  verificationPredictions: [capturedRecord]
}, () => {
  throw new Error("取得済みスナップショットを再構築してはいけない");
}, scenarioAiV6ShadowAb.build, replacementReport);
assert.equal(preRaceRerun.scenarioAiV6.lockedCount, 1);
assert.equal(JSON.stringify(preRaceRerun.verificationPredictions[0].scenarioAiV6Shadow), frozenShadow);
assert.equal(JSON.stringify(preRaceRerun.verificationPredictions[0].scenarioAiV6ShadowAb), frozenAb);

const rerun = attachSnapshots({
  verificationPredictions: [{
    ...capturedRecord,
    scenarioAiV6Verification: {
      status: "verified",
      logicFingerprint: scenarioAiV6.LOGIC_FINGERPRINT
    }
  }]
}, () => {
  throw new Error("照合済みスナップショットを再構築してはいけない");
}, scenarioAiV6ShadowAb.build, replacementReport);
assert.equal(rerun.scenarioAiV6.lockedCount, 1);
assert.equal(JSON.stringify(rerun.verificationPredictions[0].scenarioAiV6Shadow), frozenShadow);
assert.equal(JSON.stringify(rerun.verificationPredictions[0].scenarioAiV6ShadowAb), frozenAb);

const empty = attachSnapshots({ verificationPredictions: [] });
assert.equal(empty.scenarioAiV6.recordCount, 0);
assert.equal(empty.scenarioAiV6.readyCount, 0);

console.log("展開AI v6シャドー保存テスト成功");
