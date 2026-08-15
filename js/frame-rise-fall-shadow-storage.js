"use strict";

const shadowOff = require("./frame-rise-fall-shadow-off");

const VERSION = "frame-rise-fall-shadow-storage-v1";

function selectedAfterCutoff(selectedAt, cutoff) {
  const selected = Date.parse(String(selectedAt || ""));
  const lower = Date.parse(String(cutoff || ""));
  return Number.isFinite(selected) && Number.isFinite(lower) && selected > lower;
}

function build(record = {}, phase10 = {}) {
  const candidate = phase10?.candidateB || null;
  const cutoff = candidate?.prospectiveProtocol?.cutoff || {};
  if (phase10?.status !== "ready-for-shadow-ab" || !candidate) {
    return { version: VERSION, status: "phase10-not-ready", usableForPrediction: false, automaticApplication: false };
  }
  if (!selectedAfterCutoff(record?.selectedAt, cutoff?.selectedAtExclusiveLowerBound)) {
    return { version: VERSION, status: "before-or-at-cutoff", cutoff, usableForPrediction: false, automaticApplication: false };
  }
  const evidence = record?.prediction?.verificationEvidence || {};
  const scenarios = Array.isArray(evidence?.scenarios) ? evidence.scenarios : [];
  const frameMovement = Array.isArray(evidence?.frameMovement) ? evidence.frameMovement : [];
  if (scenarios.length < 2) {
    return { version: VERSION, status: "scenario-evidence-unavailable", cutoff, usableForPrediction: false, automaticApplication: false };
  }
  const result = shadowOff.build({
    mainScenario: evidence?.mainScenario || scenarios[0] || null,
    scenarios,
    frameMovement
  });
  return {
    version: VERSION,
    candidateId: candidate.candidateId,
    candidateSpecFingerprint: phase10?.readinessChecks?.recalculatedCandidateSpecFingerprint || "",
    implementationFingerprint: candidate?.implementationFingerprint || "",
    cutoff,
    selectedAt: String(record?.selectedAt || ""),
    raceKey: String(record?.raceKey || ""),
    status: result.status,
    decisionChanged: result.decisionChanged === true,
    applicableCount: result.applicableCount || 0,
    a: result.a,
    b: result.b,
    frameMovementRawEvidence: result.frameMovementRawEvidence,
    productionAUnchanged: result.productionAUnchanged === true,
    comparisonContract: {
      scenarioCaptured: true,
      practicalTicketsCaptured: false,
      skipDecisionCaptured: false,
      comparableForFixed100: false,
      reason: "downstream-decision-replay-not-yet-captured"
    },
    applicationMode: "shadow-only",
    usableForPrediction: false,
    automaticApplication: false,
    productionPredictionChanged: false,
    productionTicketSelectionChanged: false
  };
}

module.exports = { VERSION, selectedAfterCutoff, build };
