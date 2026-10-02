"use strict";

const MIN_RACES = 30;
const CRITERIA = Object.freeze([
  "recoveryRate",
  "practicalHitRate",
  "skipDecisionAccuracy",
  "hitRate"
]);

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function weakness(value, target) {
  return value === null ? null : Math.max(0, Math.round((target - value) * 10) / 10);
}

function normalizeClosures(closureReport = {}) {
  const rows = Array.isArray(closureReport?.closures) ? closureReport.closures : [];
  return new Map(rows.flatMap(row => {
    const theoryKey = String(row?.theoryKey || "");
    if (!theoryKey || row?.status !== "terminal-rejected") return [];
    return [[theoryKey, {
      status: "terminal-rejected",
      reason: String(row?.reason || "固定検証で候補が不採用となったため次候補へ進む"),
      sourceFiles: Array.isArray(row?.sourceFiles) ? row.sourceFiles.map(String) : []
    }]];
  }));
}

function buildRow(row, closures = new Map()) {
  const raceCount = Number(row?.raceCount || 0);
  const useCount = Number(row?.useCount || 0);
  const evidenceCount = Number(row?.evaluatedCount ?? useCount ?? 0);
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
  const eligible = evidenceCount >= MIN_RACES && metrics.recoveryRate !== null;
  const closure = closures.get(String(row?.theoryKey || "")) || null;
  const eligibleForSelection = eligible && !closure;

  return {
    theoryKey: String(row?.theoryKey || row?.key || ""),
    label: String(row?.label || row?.theoryKey || row?.key || ""),
    raceCount,
    useCount,
    evidenceCount,
    metrics,
    deficits,
    missingMetrics,
    evidenceStatus: eligible ? (missingMetrics.length ? "partial" : "complete") : "insufficient",
    eligible,
    eligibleForSelection,
    improvementCycleStatus: closure?.status || "open",
    improvementCycleReason: closure?.reason || null,
    improvementCycleSources: closure?.sourceFiles || [],
    selectedForImprovement: false,
    humanApprovalRequired: true,
    approved: false,
    usableForPrediction: false
  };
}

function compareRows(a, b) {
  if (a.eligibleForSelection !== b.eligibleForSelection) return a.eligibleForSelection ? -1 : 1;
  if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
  for (const key of CRITERIA) {
    const av = a.deficits[key];
    const bv = b.deficits[key];
    if (av === null && bv !== null) return 1;
    if (av !== null && bv === null) return -1;
    if (av !== null && bv !== null && av !== bv) return bv - av;
  }
  return b.evidenceCount - a.evidenceCount || a.theoryKey.localeCompare(b.theoryKey);
}

function build(performanceReport = {}, closureReport = {}) {
  const closures = normalizeClosures(closureReport);
  const ranking = (Array.isArray(performanceReport?.byTheory) ? performanceReport.byTheory : [])
    .map(row => buildRow(row, closures))
    .filter(row => row.theoryKey)
    .sort(compareRows)
    .map((row, index) => ({ ...row, rank: index + 1 }));

  const selected = ranking.find(row => row.eligibleForSelection) || null;
  if (selected) selected.selectedForImprovement = true;

  return {
    schemaVersion: 3,
    engineVersion: "profit-priority-ranking-20260909-terminal-cycle-aware",
    status: selected ? "candidate-selected" : "collecting-data",
    minimumRaceCount: MIN_RACES,
    evidenceField: "evaluatedCount",
    closureSource: "config/improvement-cycle-closures.json",
    terminalClosedTheoryCount: closures.size,
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

module.exports = { MIN_RACES, CRITERIA, numberOrNull, weakness, normalizeClosures, buildRow, compareRows, build };
