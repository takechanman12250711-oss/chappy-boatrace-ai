"use strict";

const shadowOff = require("./frame-rise-fall-shadow-off");
const replay = require("./frame-rise-fall-shadow-replay");

const VERSION = "frame-rise-fall-shadow-storage-v2";

function selectedAfterCutoff(selectedAt, cutoff) {
  const selected = Date.parse(String(selectedAt || ""));
  const lower = Date.parse(String(cutoff || ""));
  return Number.isFinite(selected) && Number.isFinite(lower) && selected > lower;
}

function build(record = {}, phase10 = {}, dependencies = {}) {
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
  const downstreamReplay = replay.build(record, result, dependencies);
  const comparableForFixed100 = downstreamReplay?.comparableForFixed100 === true;

  return {
    version: VERSION,
    candidateId: candidate.candidateId,
    candidateSpecFingerprint: phase10?.readinessChecks?.recalculatedCandidateSpecFingerprint || "",
    implementationFingerprint: candidate?.implementationFingerprint || "",
    cutoff,
    selectedAt: String(record?.selectedAt || ""),
    raceKey: String(record?.raceKey || ""),
    status: result.status,
    decisionChanged: downstreamReplay?.status === "replay-ready"
      ? downstreamReplay.decisionChanged === true
      : result.decisionChanged === true,
    applicableCount: result.applicableCount || 0,
    a: result.a,
    b: result.b,
    downstreamReplay,
    frameMovementRawEvidence: result.frameMovementRawEvidence,
    productionAUnchanged: result.productionAUnchanged === true && downstreamReplay?.productionAUnchanged !== false,
    comparisonContract: {
      scenarioCaptured: true,
      practicalTicketsCaptured: downstreamReplay?.status === "replay-ready",
      skipDecisionCaptured: downstreamReplay?.status === "replay-ready",
      comparableForFixed100,
      decisionChanged: downstreamReplay?.decisionChanged === true,
      ticketContractViolations: Number(downstreamReplay?.ticketContractViolations || 0),
      reason: comparableForFixed100
        ? "decision-fingerprint-changed-with-complete-replay"
        : downstreamReplay?.status || "downstream-replay-unavailable"
    },
    applicationMode: "shadow-only",
    usableForPrediction: false,
    automaticApplication: false,
    productionPredictionChanged: false,
    productionTicketSelectionChanged: false
  };
}

module.exports = { VERSION, selectedAfterCutoff, build };
