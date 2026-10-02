"use strict";

const METRIC_LABELS = Object.freeze({
  recoveryRate: "回収率",
  practicalHitRate: "実戦厳選的中率",
  skipDecisionAccuracy: "見送り判断精度",
  hitRate: "的中率"
});

const DEFAULT_ACTIONS = Object.freeze({
  recoveryRate: {
    changeCandidate: "低回収の成立条件を分解し、利益を落としている枝だけをA/B検証候補にする",
    expectedEffect: "不要な低配当・低期待値枝を減らし、回収率改善の余地を検証する"
  },
  practicalHitRate: {
    changeCandidate: "実戦厳選へ残す条件と外す条件を分け、的中に寄与しない枝をA/B検証候補にする",
    expectedEffect: "点数をむやみに増やさず実戦厳選的中率の改善余地を検証する"
  },
  skipDecisionAccuracy: {
    changeCandidate: "見送り・注意・勝負候補の境界条件を再点検し、誤判定が多い条件だけをA/B検証候補にする",
    expectedEffect: "無理な購入を減らし、見送り判断精度と収支安定性の改善余地を検証する"
  },
  hitRate: {
    changeCandidate: "外れレースの共通パターンを展開・相手・残しの順で分解し、見落とし条件だけをA/B検証候補にする",
    expectedEffect: "予想優先順位を崩さず的中率改善の余地を検証する"
  }
});

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function chooseWeakest(candidate = {}, priorityOrder = []) {
  const metrics = candidate.metrics || {};
  const statuses = candidate.metricStatuses || {};
  const ordered = Array.isArray(priorityOrder) && priorityOrder.length
    ? priorityOrder
    : ["recoveryRate", "practicalHitRate", "skipDecisionAccuracy", "hitRate"];

  const weak = ordered.find(key => statuses[key] === "weak");
  if (weak) return weak;
  const watch = ordered.find(key => statuses[key] === "watch");
  if (watch) return watch;
  const available = ordered.find(key => numberOrNull(metrics[key]) !== null);
  return available || null;
}

function build(phase8 = {}) {
  const candidate = phase8?.candidate || null;
  const priorityOrder = Array.isArray(phase8?.priorityOrder) ? phase8.priorityOrder : [];
  if (!candidate || candidate.ready !== true) {
    return {
      schemaVersion: 1,
      engineVersion: "theory-improvement-proposal-phase9-20260807",
      status: "waiting-for-phase8-candidate",
      sourceStatus: String(phase8?.status || "unknown"),
      proposalCount: 0,
      proposal: null,
      humanApprovalRequired: true,
      automaticApplication: false,
      usableForPrediction: false,
      uiVisible: false
    };
  }

  const metricKey = chooseWeakest(candidate, priorityOrder);
  const action = DEFAULT_ACTIONS[metricKey] || {
    changeCandidate: "候補理論の成立条件を分解し、弱い条件だけをA/B検証候補にする",
    expectedEffect: "予想ロジックを直接変更せず改善余地を検証する"
  };
  const metricValue = metricKey ? numberOrNull(candidate?.metrics?.[metricKey]) : null;

  return {
    schemaVersion: 1,
    engineVersion: "theory-improvement-proposal-phase9-20260807",
    status: "proposal-ready",
    sourceStatus: String(phase8?.status || "unknown"),
    proposalCount: 1,
    proposal: {
      theoryKey: String(candidate.theoryKey || ""),
      label: String(candidate.label || candidate.theoryKey || ""),
      evidenceCount: Number(candidate.evidenceCount || 0),
      focusMetric: metricKey,
      focusMetricLabel: METRIC_LABELS[metricKey] || metricKey,
      currentValue: metricValue,
      changeCandidate: action.changeCandidate,
      rationale: `${METRIC_LABELS[metricKey] || metricKey}を固定優先順位で最初の改善対象として確認。正式証拠${Number(candidate.evidenceCount || 0)}Rを根拠に、弱い成立条件だけを切り分ける。`,
      expectedEffect: action.expectedEffect,
      nextStep: "人が内容を確認した後、承認された変更案だけA/B検証へ進める",
      approved: false,
      humanApprovalRequired: true,
      automaticApplication: false,
      usableForPrediction: false
    },
    oneProposalOnly: true,
    humanApprovalRequired: true,
    automaticApplication: false,
    usableForPrediction: false,
    uiVisible: false
  };
}

module.exports = { METRIC_LABELS, DEFAULT_ACTIONS, numberOrNull, chooseWeakest, build };
