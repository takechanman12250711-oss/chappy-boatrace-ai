"use strict";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function build(approvalStatus = {}, config = {}) {
  const options = {
    enabled: false,
    stage: "off",
    rolloutPercent: 0,
    emergencyStop: false,
    rollbackRequested: false,
    maximumRolloutPercent: 25,
    ...config
  };

  const approved = approvalStatus?.adoptionAllowed === true;
  const stopped = options.emergencyStop === true || options.rollbackRequested === true;
  const requestedPercent = clamp(options.rolloutPercent, 0, 100);
  const cappedPercent = clamp(requestedPercent, 0, options.maximumRolloutPercent);
  const active = approved && options.enabled === true && !stopped && cappedPercent > 0;

  return {
    version: "1.0.0",
    status: stopped
      ? "stopped"
      : active
        ? "canary-ready"
        : approved
          ? "approved-not-enabled"
          : "awaiting-approval",
    approvalSatisfied: approved,
    enabled: active,
    stage: active ? "canary" : "off",
    rolloutPercent: active ? cappedPercent : 0,
    requestedRolloutPercent: requestedPercent,
    maximumRolloutPercent: Number(options.maximumRolloutPercent),
    emergencyStop: options.emergencyStop === true,
    rollbackRequested: options.rollbackRequested === true,
    automaticExpansion: false,
    automaticApplication: false,
    usableForPrediction: false,
    safeguards: {
      requiresExplicitApproval: true,
      requiresManualEnable: true,
      canaryOnly: true,
      rollbackAvailable: true,
      candidateFingerprint: String(approvalStatus?.candidateFingerprint || "")
    }
  };
}

module.exports = { build, clamp };
