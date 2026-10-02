"use strict";
const assert = require("node:assert/strict");
const snapshot = require("../js/theory-tag-snapshot");

const notApplied = snapshot.frameRiseSinkEvidence({
  frameRiseSinkSupport: { approved: true, applied: false, frameNo: 4, type: "rise", samples: 20, rate: 65, source: "venue-frame-validation" }
});
assert.equal(notApplied.formal, false, "承認済みでも実際に使っていなければ正式証拠にしない");

const notApproved = snapshot.frameRiseSinkEvidence({
  frameRiseSinkSupport: { approved: false, applied: true, frameNo: 4, type: "rise", samples: 20, rate: 65, source: "venue-frame-validation" }
});
assert.equal(notApproved.formal, false, "未承認の枠傾向を正式証拠にしない");

const insufficient = snapshot.frameRiseSinkEvidence({
  frameRiseSinkSupport: { approved: true, applied: true, frameNo: 4, type: "rise", samples: 9, rate: 65, source: "venue-frame-validation" }
});
assert.equal(insufficient.formal, false, "10件未満は蓄積中として正式証拠にしない");

const missingRate = snapshot.frameRiseSinkEvidence({
  frameRiseSinkSupport: { approved: true, applied: true, frameNo: 4, type: "rise", samples: 20, rate: null, source: "venue-frame-validation" }
});
assert.equal(missingRate.formal, false, "率が欠落している証拠を0%として正式化しない");
assert.ok(
  snapshot.buildEvidenceDiagnostics({
    frameRiseSinkSupport: { approved: true, applied: true, frameNo: 4, type: "rise", samples: 20, rate: null, source: "venue-frame-validation" }
  }).rows.find(row => row.theoryKey === "frame-rise-fall").missingReasons.includes("rate-invalid"),
  "率欠落の診断理由を保存する"
);

const prediction = {
  frameRiseSinkSupport: { approved: true, applied: true, frameNo: 4, type: "rise", samples: 12, rate: 66.7, source: "venue-frame-validation-approved" }
};
const claim = snapshot.frameRiseSinkClaimForTicket(prediction, "1-4-3");
assert.ok(claim);
assert.equal(claim.theoryKey, "frameRiseSink");
assert.equal(snapshot.frameRiseSinkClaimForTicket(prediction, "1-2-3"), null, "対象枠を含まない買い目へ帰属しない");

const built = snapshot.build(prediction, [{ ticket: "1-4-3", category: "本線" }]);
const theory = built.theories.find(row => row.theoryKey === "frameRiseSink");
assert.ok(theory);
assert.equal(theory.formal, true);
assert.equal(built.usableForPrediction, false);
assert.equal(built.automaticApplication, false);

const runtimePrediction = {
  verificationEvidence: {
    tickets: [
      { ticket: "4-1-3", roleClaims: [{ role: "attack", boatNo: 4, expectedPositions: [1] }] },
      { ticket: "1-4-3", roleClaims: [{ role: "attack", boatNo: 1, expectedPositions: [1] }] },
      { ticket: "4-2-3", roleClaims: [{ role: "attack", boatNo: 2, expectedPositions: [1] }] },
      { ticket: "4-3-2", roleClaims: [] }
    ]
  },
  aiCore: {
    raceScenarios: {
      mainScenario: { type: "fourAttack" },
      scenarios: [
        { type: "fourAttack", attacker: 4, frameMovementAdjustment: 2 },
        { type: "escape", attacker: 1, frameMovementAdjustment: -5 }
      ],
      frameMovement: [
        { boatNo: 4, label: "浮上", samples: 180, riseRate: 48, sinkRate: 33, movementDelta: 8, scoreAdjustment: 2, appliedToScore: true },
        { boatNo: 1, label: "沈下", samples: 180, riseRate: 0, sinkRate: 60, movementDelta: -21, scoreAdjustment: -5, appliedToScore: true }
      ]
    }
  }
};
const runtimeBefore = JSON.stringify(runtimePrediction);
const applied = snapshot.appliedFrameRiseSinkSupport(runtimePrediction);
assert.equal(applied.frameNo, 4, "調整幅より実際の本線シナリオを優先する");
assert.equal(applied.type, "rise");
assert.equal(applied.rate, 48);
assert.equal(applied.source, "ai-core-frame-movement-v1");
const runtimeEvidence = snapshot.frameRiseSinkEvidence(runtimePrediction);
assert.equal(runtimeEvidence.formal, true);
assert.equal(runtimeEvidence.scenarioType, "fourAttack");
assert.equal(runtimeEvidence.scoreAdjustment, 2);
assert.equal(runtimeEvidence.movementDelta, 8);
assert.equal(JSON.stringify(runtimePrediction), runtimeBefore, "正式証拠の保存は予想計算済みオブジェクトを変更しない");

const swappedRuntime = snapshot.appliedFrameRiseSinkSupport({
  aiCore: {
    raceScenarios: {
      mainScenario: { type: "threeAttack" },
      scenarios: [{
        type: "threeAttack",
        attacker: 3,
        attackerCourse: 3,
        attackerBoatNo: 6,
        headBoatNo: 6,
        frameMovementAdjustment: 3
      }],
      frameMovement: [{
        boatNo: 6,
        label: "浮上",
        samples: 180,
        riseRate: 52,
        movementDelta: 12,
        scoreAdjustment: 3,
        appliedToScore: true
      }]
    }
  }
});
assert.equal(
  swappedRuntime.frameNo,
  6,
  "legacy attackerの3コースではなく実際に補正した6号艇を正式証拠へ使う"
);

const runtimeBuilt = snapshot.build(runtimePrediction, [
  { ticket: "4-1-3", category: "本線" },
  { ticket: "1-4-3", category: "押さえ" }
]);
const runtimeTheory = runtimeBuilt.theories.find(row => row.theoryKey === "frameRiseSink");
const runtimeDiagnostic = runtimeBuilt.evidenceDiagnostics.rows.find(row => row.theoryKey === "frame-rise-fall");
assert.deepEqual(runtimeTheory.tickets, ["4-1-3"], "実際に補正した本線頭の買い目だけへ帰属する");
assert.equal(runtimeDiagnostic.supportPresent, true);
assert.equal(runtimeDiagnostic.formal, true);
assert.equal(runtimeDiagnostic.metrics.scoreAdjustment, 2);
assert.equal(runtimeDiagnostic.metrics.movementDelta, 8);
const roleRejected = snapshot.build(runtimePrediction, [
  { ticket: "4-2-3", category: "本線" },
  { ticket: "4-3-2", category: "押さえ" }
]);
assert.equal(
  roleRejected.theories.some(row => row.theoryKey === "frameRiseSink"),
  false,
  "1着頭が一致しても攻め役割の構造化根拠が無い買い目へ帰属しない"
);

const unrelatedAlternate = snapshot.appliedFrameRiseSinkSupport({
  verificationEvidence: {
    mainScenario: { type: "fourAttack" },
    scenarios: [
      { type: "fourAttack", attacker: 4, frameMovementAdjustment: 0 },
      { type: "threeAttack", attacker: 3, frameMovementAdjustment: -4 }
    ],
    frameMovement: [
      { boatNo: 3, label: "沈下", samples: 90, sinkRate: 54, scoreAdjustment: -4, appliedToScore: true }
    ]
  }
});
assert.equal(unrelatedAlternate, null, "別展開の補正を本線由来の正式証拠へ流用しない");

const rejectedRows = [
  { boatNo: 4, label: "浮上", samples: 180, riseRate: 48, scoreAdjustment: 2, appliedToScore: false },
  { boatNo: 4, label: "浮上", samples: 180, riseRate: 48, scoreAdjustment: 0, appliedToScore: true },
  { boatNo: 4, label: "維持", samples: 180, riseRate: 48, scoreAdjustment: 2, appliedToScore: true }
];
rejectedRows.forEach(frame => {
  assert.equal(snapshot.frameRiseSinkEvidence({
    aiCore: { raceScenarios: {
      mainScenario: { type: "fourAttack" },
      scenarios: [{ type: "fourAttack", attacker: 4, frameMovementAdjustment: 2 }],
      frameMovement: [frame]
    } }
  }).formal, false);
});
assert.equal(snapshot.frameRiseSinkEvidence({
  aiCore: { raceScenarios: {
    mainScenario: { type: "fourAttack" },
    scenarios: [{ type: "fourAttack", attacker: 4, frameMovementAdjustment: 2 }],
    frameMovement: [{ boatNo: 4, label: "浮上", samples: 180, riseRate: null, scoreAdjustment: 2, appliedToScore: true }]
  } }
}).formal, false, "AIコア行でも率欠落を0%として正式化しない");
assert.equal(snapshot.appliedFrameRiseSinkSupport({
  aiCore: { raceScenarios: {
    mainScenario: { type: "fourAttack" },
    scenarios: [{ type: "fourAttack", attacker: 4, frameMovementAdjustment: 1 }],
    frameMovement: [{ boatNo: 4, label: "浮上", samples: 180, riseRate: 48, scoreAdjustment: 2, appliedToScore: true }]
  } }
}).applied, false, "シナリオへ加えた値と枠統計が一致しなければ正式化しない");

const explicitRejection = snapshot.frameRiseSinkEvidence({
  ...runtimePrediction,
  frameRiseSinkSupport: { approved: false, applied: true, frameNo: 4, type: "rise", samples: 180, rate: 48, source: "explicit-review" }
});
assert.equal(explicitRejection.formal, false, "明示された未承認supportをAI補正からのfallbackで上書きしない");

const evaluated = require("../js/theory-evaluation-engine").build({
  raceKey: "frame-runtime-test",
  result: { settled: true, resultTicket: "4-1-3" },
  theoryTagSnapshot: runtimeBuilt
}).evaluations.find(row => row.theoryKey === "frame-rise-fall");
assert.equal(evaluated.status, "evaluated", "保存した正式証拠をPhase7評価へ接続する");
assert.equal(evaluated.matched, true);
console.log("frame rise sink formal evidence tests passed");
