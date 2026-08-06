"use strict";

const MIN_RACES = 30;
const CRITERIA = Object.freeze([
  "recoveryRate",
  "practicalHitRate",
  "skipDecisionAccuracy",
  "hitRate"
]);

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function weakness(value, target) {
  return value === null ? null : Math.max(0, Math.round((target - value) * 10) / 10);
}

function buildRow(row) {
  const raceCount = Number(row?.raceCount || 0);
  const metrics = {
    recoveryRate: numberOrNull(row?.recoveryRate),
    practicalHitRate: numberOrNull(row?.practicalHitRate),
    skipDecisionAccuracy: numberOrNull(row?.skipDecisionAccuracy),
    hitRate: numberOrNull(row?.hitRate)
  };
  const deficits = {
    recoveryRate: weakness(metrics.recoveryRate, 100),
    practicalHitRate: weakness(metrics.practicalHitRate, 20),
    skipDecisionAccuracy: weakness(metrics.skipDecisionAccuracy, 70),
    hitRate: weakness(metrics.hitRate, 15)
  };
  const missingMetrics = CRITERIA.filter(key => metrics[key] === null);
  const eligible = raceCount >= MIN_RACES && metrics.recoveryRate !== null;

  return {
    theoryKey: String(row?.theoryKey || row?.key || ""),
    label: String(row?.label || row?.theoryKey || row?.key || ""),
    raceCount,
    useCount: Number(row?.useCount || 0),
    metrics,
    deficits,
    missingMetrics,
    evidenceStatus: eligible ? (missingMetrics.length ? "partial" : "complete") : "insufficient",
    eligible,
    selectedForImprovement: false,
    humanApprovalRequired: true,
    approved: false,
    usableForPrediction: false
  };
}

function compareRows(a, b) {
  if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
  for (const key of CRITERIA) {
    const av = a.deficits[key];
    const bv = b.deficits[key];
    if (av === null && bv !== null) return 1;
    if (av !== null && bv === null) return -1;
    if (av !== null && bv !== null && av !== bv) return bv - av;
  }
  return b.raceCount - a.raceCount || a.theoryKey.localeCompare(b.theoryKey);
}

function build(performanceReport = {}) {
  const ranking = (Array.isArray(performanceReport?.byTheory) ? performanceReport.byTheory : [])
    .map(buildRow)
    .filter(row => row.theoryKey)
    .sort(compareRows)
    .map((row, index) => ({ ...row, rank: index + 1 }));

  const selected = ranking.find(row => row.eligible) || null;
  if (selected) selected.selectedForImprovement = true;

  return {
    schemaVersion: 1,
    engineVersion: "profit-priority-ranking-20260806",
    status: selected ? "candidate-selected" : "collecting-data",
    minimumRaceCount: MIN_RACES,
    priorityOrder: [...CRITERIA],
    ranking,
    selectedTheory: selected ? {
      theoryKey: selected.theoryKey,
      label: selected.label,
      rank: selected.rank,
      reason: "利益基準の固定優先順位で最も改善余地が大きい候補",
      evidenceStatus: selected.evidenceStatus,
      missingMetrics: selected.missingMetrics
    } : null,
    oneCandidateOnly: true,
    humanApprovalRequired: true,
    automaticApplication: false,
    usableForPrediction: false,
    uiVisible: false
  };
}

module.exports = { MIN_RACES, CRITERIA, numberOrNull, weakness, buildRow, compareRows, build };
