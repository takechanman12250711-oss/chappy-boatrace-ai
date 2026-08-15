"use strict";
const assert = require("node:assert/strict");
const storage = require("../js/frame-rise-fall-shadow-storage");
const builder = require("./build-frame-rise-fall-shadow-snapshots");

const cutoff = "2026-08-15T11:06:15+09:00";
const phase10 = {
  status: "ready-for-shadow-ab",
  candidateB: {
    candidateId: "frame-rise-fall-shadow-off-v1",
    implementationFingerprint: "frame-rise-fall-shadow-off-ablation-v1",
    prospectiveProtocol: { cutoff: { status: "frozen", selectedAtExclusiveLowerBound: cutoff } }
  },
  readinessChecks: { recalculatedCandidateSpecFingerprint: "sha256:test" },
  comparison: { minimumComparableRaces: 100 }
};
const evidence = {
  mainScenario: { type: "fourAttack", score: 72, attackerBoatNo: 4, headBoatNo: 4, frameMovementAdjustment: 5 },
  scenarios: [
    { type: "fourAttack", score: 72, attackerBoatNo: 4, headBoatNo: 4, frameMovementAdjustment: 5 },
    { type: "escape", score: 69, attackerBoatNo: 1, headBoatNo: 1, frameMovementAdjustment: 0 }
  ],
  frameMovement: [{ boatNo: 4, scoreAdjustment: 5, movementDelta: 18, label: "浮上", appliedToScore: true }]
};
const before = storage.build({ raceKey: "before", selectedAt: cutoff, prediction: { verificationEvidence: evidence } }, phase10);
assert.equal(before.status, "before-or-at-cutoff");
const after = storage.build({ raceKey: "after", selectedAt: "2026-08-15T11:06:16+09:00", prediction: { verificationEvidence: evidence } }, phase10);
assert.equal(after.status, "shadow-ready");
assert.equal(after.productionAUnchanged, true);
assert.equal(after.a.mainScenario.score, 72);
assert.equal(after.b.mainScenario.type, "escape");
assert.equal(after.comparisonContract.comparableForFixed100, false);
assert.equal(after.usableForPrediction, false);
assert.equal(after.automaticApplication, false);
const attached = builder.attach({ verificationPredictions: [{ raceKey: "after", selectedAt: "2026-08-15T11:06:16+09:00", prediction: { verificationEvidence: evidence } }] }, phase10);
assert.equal(attached.frameRiseFallShadowAb.capturedCount, 1);
assert.equal(attached.frameRiseFallShadowAb.decisionChangedCount, 1);
assert.equal(attached.frameRiseFallShadowAb.comparableRaceCount, 0);
assert.equal(attached.frameRiseFallShadowAb.fixedComparableRaceCount, 100);
console.log("frame rise fall prospective shadow storage tests passed");
