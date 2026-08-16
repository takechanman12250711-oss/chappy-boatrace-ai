"use strict";

const VERSION = "frame-rise-fall-negative-clip-shadow-v1";
const CANDIDATE_ID = "frame-rise-fall-negative-clip-v1";
const LOGIC_FINGERPRINT = "frame-rise-fall-negative-adjustment-clip-v1";

function n(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function scenarioBoatNo(scenario = {}) {
  return Number(
    scenario?.attackerBoatNo ??
    scenario?.headBoatNo ??
    scenario?.attacker ??
    0
  ) || null;
}

function matchingNegativeMovement(scenario = {}, frameMovement = []) {
  const boatNo = scenarioBoatNo(scenario);
  const adjustment = n(scenario?.frameMovementAdjustment);
  if (!boatNo || adjustment >= 0) return null;

  return (Array.isArray(frameMovement) ? frameMovement : []).find(row =>
    Number(row?.boatNo) === boatNo &&
    row?.appliedToScore === true &&
    n(row?.scoreAdjustment) === adjustment &&
    n(row?.scoreAdjustment) < 0
  ) || null;
}

function scenarioFingerprint(scenario = {}) {
  return [
    String(scenario?.type || ""),
    Number(scenarioBoatNo(scenario) || 0),
    Number(scenario?.score || 0)
  ].join(":");
}

function build(raceScenarios = {}) {
  const sourceBefore = JSON.stringify(raceScenarios || {});
  const scenarios = Array.isArray(raceScenarios?.scenarios)
    ? raceScenarios.scenarios.map((row, index) => ({ ...clone(row), __originalIndex: index }))
    : [];
  const frameMovement = Array.isArray(raceScenarios?.frameMovement)
    ? clone(raceScenarios.frameMovement)
    : [];

  const aScenarios = scenarios.map(row => {
    const { __originalIndex, ...clean } = row;
    return clean;
  });

  const bScenarios = scenarios.map(row => {
    const movement = matchingNegativeMovement(row, frameMovement);
    if (!movement) return { ...row, shadowNegativeFrameMovementClipped: false };

    const rawAdjustment = n(row.frameMovementAdjustment);
    return {
      ...row,
      score: n(row.score) - rawAdjustment,
      rawFrameMovementAdjustment: rawAdjustment,
      frameMovementAdjustment: 0,
      shadowNegativeFrameMovementClipped: true,
      shadowNegativeFrameMovementEvidence: {
        boatNo: Number(movement.boatNo),
        scoreAdjustment: n(movement.scoreAdjustment),
        movementDelta: n(movement.movementDelta),
        label: String(movement.label || "")
      }
    };
  }).sort((left, right) =>
    n(right.score) - n(left.score) ||
    left.__originalIndex - right.__originalIndex
  );

  const applicableCount = bScenarios.filter(row => row.shadowNegativeFrameMovementClipped).length;
  const aMain = clone(raceScenarios?.mainScenario || aScenarios[0] || null);
  const bMainRaw = bScenarios[0] || null;
  const bMain = bMainRaw
    ? (() => { const { __originalIndex, ...clean } = bMainRaw; return clean; })()
    : null;
  const cleanBScenarios = bScenarios.map(row => {
    const { __originalIndex, ...clean } = row;
    return clean;
  });

  const sourceAfter = JSON.stringify(raceScenarios || {});

  return {
    version: VERSION,
    candidateId: CANDIDATE_ID,
    logicFingerprint: LOGIC_FINGERPRINT,
    status: !scenarios.length
      ? "scenario-unavailable"
      : applicableCount > 0
        ? "shadow-ready"
        : "candidate-not-applicable",
    a: {
      label: "current-production",
      mainScenario: aMain,
      scenarios: aScenarios
    },
    b: {
      label: "negative-frame-movement-adjustment-clipped-to-zero",
      mainScenario: bMain,
      scenarios: cleanBScenarios
    },
    frameMovementRawEvidence: frameMovement,
    applicableCount,
    decisionChanged: Boolean(aMain && bMain && scenarioFingerprint(aMain) !== scenarioFingerprint(bMain)),
    productionAUnchanged: sourceBefore === sourceAfter,
    preservesPositiveAdjustments: true,
    preservesRawAdjustmentEvidence: true,
    applicationMode: "shadow-B-only",
    usableForPrediction: false,
    automaticApplication: false,
    productionPredictionChanged: false,
    productionTicketSelectionChanged: false
  };
}

module.exports = {
  VERSION,
  CANDIDATE_ID,
  LOGIC_FINGERPRINT,
  build,
  matchingNegativeMovement,
  scenarioBoatNo
};
