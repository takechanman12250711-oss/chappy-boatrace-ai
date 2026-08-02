"use strict";

function build(approval = {}, rollout = {}, monitor = {}) {
  const approved = approval?.status === "approved" && approval?.adoptionAllowed === true;
  const running = rollout?.status === "canary-running" && rollout?.enabled === true && Number(rollout?.rolloutPercent || 0) > 0;
  const stopped = rollout?.status === "stopped" || rollout?.emergencyStop === true || rollout?.rollbackRequested === true;
  const stopRequested = monitor?.stopRequested === true;
  const rollbackRecommended = monitor?.rollbackRecommended === true;

  let status = "not-running";
  let requiresOperatorAction = false;
  let nextAction = "カナリアは未稼働";

  if (stopped) {
    status = "stopped-or-rolled-back";
    nextAction = "反映率0%と停止状態を確認し、再開時は新しい明示承認を行う";
  } else if (stopRequested || rollbackRecommended) {
    status = "operator-action-required";
    requiresOperatorAction = true;
    nextAction = "緊急停止または巻き戻しを実行する";
  } else if (running) {
    status = "monitoring-canary";
    nextAction = "カナリア実績の監視を継続する";
  } else if (approved) {
    status = "approved-not-running";
    nextAction = "必要な場合のみ手動でカナリアを開始する";
  }

  const actions = requiresOperatorAction
    ? [
        "data/config/scenario-ai-v6-rollout.json の emergencyStop を true にする",
        "scenario-ai-v6-rollout-status.json の rolloutPercent が 0 になったことを確認する",
        "scenario-ai-v6-monitor.json の悪化指標・場別結果を確認する",
        "再開時は候補内容を再確認し、新しい明示承認を要求する"
      ]
    : [];

  return {
    schemaVersion: 1,
    status,
    nextAction,
    requiresOperatorAction,
    stopRequested,
    rollbackRecommended,
    snapshot: {
      approvalStatus: String(approval?.status || "unknown"),
      rolloutStatus: String(rollout?.status || "unknown"),
      rolloutPercent: Number(rollout?.rolloutPercent || 0),
      monitorStatus: String(monitor?.status || "unknown"),
      comparableCount: Number(monitor?.metrics?.comparableCount || 0),
      aWins: Number(monitor?.metrics?.aWins || 0),
      bWins: Number(monitor?.metrics?.bWins || 0),
      advantagePoints: Number(monitor?.metrics?.advantagePoints || 0),
      harmfulVenueCount: Number(monitor?.metrics?.harmfulVenueCount || 0)
    },
    actions,
    automaticStopApplication: false,
    automaticRollbackApplication: false,
    automaticApplication: false,
    usableForPrediction: false
  };
}

module.exports = { build };
