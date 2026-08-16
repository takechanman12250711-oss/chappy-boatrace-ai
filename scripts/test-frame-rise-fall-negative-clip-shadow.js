"use strict";

const assert = require("node:assert/strict");
const shadow = require("../js/frame-rise-fall-negative-clip-shadow");

const input = {
  mainScenario: {
    type: "fourAttack",
    attackerBoatNo: 4,
    score: 70,
    frameMovementAdjustment: -3
  },
  scenarios: [
    {
      type: "fourAttack",
      attackerBoatNo: 4,
      score: 70,
      frameMovementAdjustment: -3
    },
    {
      type: "escape",
      headBoatNo: 1,
      score: 72,
      frameMovementAdjustment: 2
    },
    {
      type: "sashi",
      attackerBoatNo: 2,
      score: 68,
      frameMovementAdjustment: 0
    }
  ],
  frameMovement: [
    {
      boatNo: 4,
      appliedToScore: true,
      scoreAdjustment: -3,
      movementDelta: -9,
      label: "浮上"
    },
    {
      boatNo: 1,
      appliedToScore: true,
      scoreAdjustment: 2,
      movementDelta: 3,
      label: "維持"
    }
  ]
};

const before = JSON.stringify(input);
const result = shadow.build(input);

assert.equal(result.status, "shadow-ready");
assert.equal(result.applicableCount, 1);
assert.equal(result.productionAUnchanged, true);
assert.equal(JSON.stringify(input), before);
assert.equal(result.usableForPrediction, false);
assert.equal(result.automaticApplication, false);
assert.equal(result.productionPredictionChanged, false);
assert.equal(result.productionTicketSelectionChanged, false);
assert.equal(result.preservesPositiveAdjustments, true);

const clipped = result.b.scenarios.find(row => row.attackerBoatNo === 4);
assert.equal(clipped.rawFrameMovementAdjustment, -3);
assert.equal(clipped.frameMovementAdjustment, 0);
assert.equal(clipped.score, 73);
assert.equal(clipped.shadowNegativeFrameMovementClipped, true);

const positive = result.b.scenarios.find(row => row.headBoatNo === 1);
assert.equal(positive.frameMovementAdjustment, 2);
assert.equal(positive.score, 72);
assert.equal(positive.shadowNegativeFrameMovementClipped, false);

const neutral = result.b.scenarios.find(row => row.attackerBoatNo === 2);
assert.equal(neutral.frameMovementAdjustment, 0);
assert.equal(neutral.score, 68);
assert.equal(neutral.shadowNegativeFrameMovementClipped, false);

assert.equal(result.b.mainScenario.type, "fourAttack");
assert.equal(result.decisionChanged, true);

const noNegative = shadow.build({
  mainScenario: { type: "escape", headBoatNo: 1, score: 70, frameMovementAdjustment: 2 },
  scenarios: [{ type: "escape", headBoatNo: 1, score: 70, frameMovementAdjustment: 2 }],
  frameMovement: [{ boatNo: 1, appliedToScore: true, scoreAdjustment: 2 }]
});
assert.equal(noNegative.status, "candidate-not-applicable");
assert.equal(noNegative.applicableCount, 0);

console.log("frame rise/fall negative clip shadow test: ok");
