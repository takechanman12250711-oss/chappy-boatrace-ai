"use strict";

const METRIC_ORDER = Object.freeze([
  "recoveryRate",
  "practicalHitRate",
  "skipDecisionAccuracy",
  "hitRate"
]);

function build(phase9 = {}) {
  const proposal = phase9?.proposal || null;
  const approved = proposal?.approved === true;
  const ready = phase9?.status === "proposal-ready" && approved;

  return {
    schemaVersion: 1,
    engineVersion: "theory-ab-phase10-20260807",
    status: ready ? "ready-for-shadow-ab" : "waiting-for-approved-phase9-proposal",
    sourceStatus: String(phase9?.status || "unknown"),
    metricOrder: [...METRIC_ORDER],
    baselineA: {
      label: "A: current-production",
      immutable: true,
      productionPrediction: true,
      productionPurchaseSelection: true
    },
    candidateB: ready ? {
      label: "B: approved-improvement-shadow",
      theoryKey: String(proposal?.theoryKey || ""),
      theoryLabel: String(proposal?.label || proposal?.theoryKey || ""),
      focusMetric: String(proposal?.focusMetric || ""),
      changeCandidate: String(proposal?.changeCandidate || ""),
      rationale: String(proposal?.rationale || ""),
      expectedEffect: String(proposal?.expectedEffect || ""),
      shadowOnly: true,
      productionPrediction: false,
      productionPurchaseSelection: false
    } : null,
    comparison: {
      minimumComparableRaces: 50,
      metrics: [...METRIC_ORDER],
      resultStatuses: ["a-win", "b-win", "draw", "insufficient-data"],
      automaticWinnerSelection: false
    },
    proposalApproved: approved,
    humanApprovalRequired: true,
    automaticApplication: false,
    usableForPrediction: false,
    uiVisible: false
  };
}

module.exports = { METRIC_ORDER, build };
