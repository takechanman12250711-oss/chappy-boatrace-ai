"use strict";

const shadowOff = require("./frame-rise-fall-shadow-off");

const VERSION = "frame-rise-fall-shadow-off-verifier-v1";
const PRESENT = true;

function verify(candidate = {}) {
  const specMatches = shadowOff.verifyCandidateSpec(candidate);
  if (!specMatches) {
    return {
      present: true,
      verified: false,
      implementationPresent: true,
      candidateSpecMatches: false,
      reason: "candidate-spec-mismatch",
      implementationFingerprint: shadowOff.LOGIC_FINGERPRINT
    };
  }

  const probe = {
    mainScenario: {
      type: "fourAttack",
      score: 72,
      attackerBoatNo: 4,
      headBoatNo: 4,
      frameMovementAdjustment: 5
    },
    scenarios: [
      {
        type: "fourAttack",
        score: 72,
        attackerBoatNo: 4,
        headBoatNo: 4,
        frameMovementAdjustment: 5
      },
      {
        type: "escape",
        score: 69,
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
  const before = JSON.stringify(probe);
  const result = shadowOff.build(probe);
  const verified =
    result?.status === "shadow-ready" &&
    result?.productionAUnchanged === true &&
    JSON.stringify(probe) === before &&
    result?.effectiveFrameMovementAdjustment === 0 &&
    result?.preservesRawAdjustmentEvidence === true &&
    result?.applicationMode === "shadow-B-only" &&
    result?.usableForPrediction === false &&
    result?.automaticApplication === false &&
    result?.productionPredictionChanged === false &&
    result?.productionTicketSelectionChanged === false;

  return {
    present: true,
    verified,
    implementationPresent: true,
    candidateSpecMatches: true,
    reason: verified ? "verified" : "probe-failed",
    implementationFingerprint: shadowOff.LOGIC_FINGERPRINT,
    version: VERSION
  };
}

module.exports = {
  VERSION,
  PRESENT,
  verify
};
