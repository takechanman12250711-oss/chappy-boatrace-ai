"use strict";

const assert = require("node:assert/strict");
const shadow = require("../js/frame-rise-fall-shadow-off");

const source = {
  mainScenario: {
    type: "fourAttack",
    score: 72,
    attacker: 4,
    attackerBoatNo: 4,
    headBoatNo: 4,
    frameMovementAdjustment: 5
  },
  scenarios: [
    {
      type: "fourAttack",
      score: 72,
      attacker: 4,
      attackerBoatNo: 4,
      headBoatNo: 4,
      frameMovementAdjustment: 5
    },
    {
      type: "escape",
      score: 69,
      attacker: 1,
      attackerBoatNo: 1,
      headBoatNo: 1,
      frameMovementAdjustment: 0
    }
  ],
  frameMovement: [
    {
      boatNo: 4,
      label: "浮上",
      scoreAdjustment: 5,
      movementDelta: 18,
      appliedToScore: true
    }
  ]
};

const before = JSON.stringify(source);
const result = shadow.build(source);
assert.equal(result.status, "shadow-ready");
assert.equal(result.productionAUnchanged, true);
assert.equal(JSON.stringify(source), before, "本番A入力を変更しない");
assert.equal(result.applicableCount, 1);
assert.equal(result.a.mainScenario.type, "fourAttack");
assert.equal(result.b.mainScenario.type, "escape", "補正OFFで主展開が変わる場合だけBへ反映する");
assert.equal(result.b.scenarios.find(row => row.type === "fourAttack").score, 67);
assert.equal(result.b.scenarios.find(row => row.type === "fourAttack").frameMovementAdjustment, 0);
assert.equal(result.b.scenarios.find(row => row.type === "fourAttack").rawFrameMovementAdjustment, 5);
assert.equal(result.preservesRawAdjustmentEvidence, true);
assert.equal(result.applicationMode, "shadow-B-only");
assert.equal(result.usableForPrediction, false);
assert.equal(result.automaticApplication, false);
assert.equal(result.productionPredictionChanged, false);
assert.equal(result.productionTicketSelectionChanged, false);

const mismatch = shadow.build({
  mainScenario: source.mainScenario,
  scenarios: source.scenarios,
  frameMovement: [{
    boatNo: 4,
    scoreAdjustment: 4,
    appliedToScore: true
  }]
});
assert.equal(mismatch.status, "candidate-not-applicable", "正式な適用値と一致しない証拠はfail closed");
assert.equal(mismatch.applicableCount, 0);

assert.equal(shadow.verifyCandidateSpec({
  candidateId: "frame-rise-fall-shadow-off-v1",
  proposedChange: {
    scope: "shadow-B-only",
    action: "set-effective-frame-movement-adjustment",
    effectiveValue: 0,
    preserveRawAdjustmentEvidence: true,
    preserveAllOtherScenarioInputs: true,
    productionAUnchanged: true,
    ticketContractUnchanged: true
  }
}), true);

assert.equal(shadow.verifyCandidateSpec({
  candidateId: "frame-rise-fall-shadow-off-v1",
  proposedChange: {
    scope: "production",
    action: "set-effective-frame-movement-adjustment",
    effectiveValue: 0
  }
}), false, "本番変更仕様はverifierで拒否する");

console.log("frame rise fall shadow-off tests passed");
