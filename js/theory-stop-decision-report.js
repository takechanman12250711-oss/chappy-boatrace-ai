"use strict";

function build(approvalStatus = {}, rollout = {}, monitor = {}) {
  const canaryActive = rollout?.enabled === true && Number(rollout?.rolloutPercent || 0) > 0;
  const stopRequested = monitor?.stopRequested === true;
  const rollbackRecommended = monitor?.rollbackRecommended === true;
  const approvalValid = approvalStatus?.adoptionAllowed === true;

  let status = "no-action";
  let recommendedAction = "keep-off";

  if (stopRequested || rollbackRecommended) {
    status = "operator-action-required";
    recommendedAction = "stop-and-rollback";
  } else if (canaryActive) {
    status = "monitoring-canary";
    recommendedAction = "continue-monitoring";
  } else if (approvalValid) {
    status = "approved-not-running";
    recommendedAction = "keep-disabled-until-manual-enable";
  }

  return {
    version: "1.0.0",
    status,
    recommendedAction,
    approvalValid,
    canaryActive,
    rolloutPercent: canaryActive ? Number(rollout.rolloutPercent || 0) : 0,
    monitorStatus: String(monitor?.status || "unknown"),
    stopRequested,
    rollbackRecommended,
    reasons: Array.isArray(monitor?.reasons) ? monitor.reasons : [],
    currentSafeguards: {
      automaticApplication: false,
      automaticStopApplication: false,
      requiresOperatorAction: true,
      emergencyStopAvailable: true,
      rollbackAvailable: true
    },
    requiredSteps: stopRequested || rollbackRecommended
      ? [
          "段階反映設定の emergencyStop を true にする",
          "rolloutPercent が 0 になったことを確認する",
          "異常対象の理論・場・比較期間を確認する",
          "再開には新しい明示承認を要求する"
        ]
      : [],
    usableForPrediction: false,
    automaticApplication: false
  };
}

module.exports = { build };
