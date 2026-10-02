"use strict";

const MIN_EVIDENCE = 30;
const METRICS = Object.freeze([
  "recoveryRate",
  "practicalHitRate",
  "skipDecisionAccuracy",
  "hitRate"
]);

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function metricStatus(key, value) {
  if (value === null) return "missing";
  if (key === "recoveryRate") return value >= 100 ? "strong" : value >= 90 ? "watch" : "weak";
  if (key === "practicalHitRate") return value >= 20 ? "strong" : value >= 15 ? "watch" : "weak";
  if (key === "skipDecisionAccuracy") return value >= 70 ? "strong" : value >= 60 ? "watch" : "weak";
  if (key === "hitRate") return value >= 15 ? "strong" : value >= 10 ? "watch" : "weak";
  return "unknown";
}

function reviewRow(row) {
  const evidenceCount = Number(row?.evaluatedCount || 0);
  const metrics = Object.fromEntries(METRICS.map(key => [key, numberOrNull(row?.[key])]));
  const metricStatuses = Object.fromEntries(METRICS.map(key => [key, metricStatus(key, metrics[key])]));
  const missingMetrics = METRICS.filter(key => metrics[key] === null);
  return {
    theoryKey: String(row?.theoryKey || row?.key || ""),
    label: String(row?.label || row?.theoryKey || row?.key || ""),
    evidenceCount,
    raceCount: Number(row?.raceCount || 0),
    useCount: Number(row?.useCount || 0),
    metrics,
    metricStatuses,
    missingMetrics,
    ready: evidenceCount >= MIN_EVIDENCE,
    humanApprovalRequired: true,
    approved: false,
    automaticApplication: false,
    usableForPrediction: false
  };
}

function build(performance = {}, ranking = {}) {
  const rows = (Array.isArray(performance?.byTheory) ? performance.byTheory : [])
    .map(reviewRow)
    .filter(row => row.theoryKey);
  const selectedKey = String(ranking?.selectedTheory?.theoryKey || "");
  const selected = rows.find(row => row.theoryKey === selectedKey && row.ready) || null;
  const readyRows = rows.filter(row => row.ready);

  return {
    schemaVersion: 1,
    engineVersion: "theory-profit-review-phase8-20260807",
    status: selected ? "review-candidate-ready" : readyRows.length ? "ready-awaiting-ranking" : "collecting-data",
    minimumEvidenceCount: MIN_EVIDENCE,
    priorityOrder: METRICS.slice(),
    readyTheoryCount: readyRows.length,
    candidate: selected ? {
      theoryKey: selected.theoryKey,
      label: selected.label,
      evidenceCount: selected.evidenceCount,
      ready: selected.ready,
      metrics: selected.metrics,
      metricStatuses: selected.metricStatuses,
      missingMetrics: selected.missingMetrics,
      reason: "利益基準ランキングで選ばれ、正式証拠30R以上に到達したためレビュー候補化"
    } : null,
    theories: rows,
    oneCandidateOnly: true,
    humanApprovalRequired: true,
    automaticApplication: false,
    usableForPrediction: false,
    uiVisible: false
  };
}

module.exports = { MIN_EVIDENCE, METRICS, numberOrNull, metricStatus, reviewRow, build };
