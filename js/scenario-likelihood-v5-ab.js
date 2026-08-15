"use strict";

const KEY_LABELS = {
  inEscape: "1逃げ",
  course2Sashi: "2差し",
  course3Attack: "3攻め",
  course4Kado: "4カド"
};

function round1(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function approvedCandidates(report) {
  return Array.isArray(report?.approvalGate?.approvedCandidates)
    ? report.approvalGate.approvedCandidates
    : Array.isArray(report?.approvedCandidates)
      ? report.approvedCandidates
      : [];
}

function scenarioLabel(row) {
  return String(row?.label || KEY_LABELS[row?.key] || row?.key || "");
}

function matchingAdjustment(candidate, context, row) {
  if (!candidate?.approved) return 0;
  const venue = String(context?.jcd || "").padStart(2, "0");
  const label = scenarioLabel(row);
  const key = String(candidate.key || "");
  const matches =
    (candidate.scope === "venue" && key === venue) ||
    (candidate.scope === "scenario" && key === label) ||
    (candidate.scope === "venue-scenario" && key === `${venue}:${label}`) ||
    (candidate.scope === "ambiguity" && key === String(context?.ambiguity || ""));
  if (!matches) return 0;
  const points = Math.min(5, Math.max(0, Number(candidate.adjustmentPoints || 0)));
  return candidate.action === "raise" ? points : candidate.action === "lower" ? -points : 0;
}

function normalize(rows) {
  const safe = rows.map(row => ({ ...row, adjustedRaw: Math.max(0.1, Number(row.adjustedRaw || 0)) }));
  const total = safe.reduce((sum, row) => sum + row.adjustedRaw, 0) || 1;
  return safe
    .map(row => ({
      key: row.key,
      label: row.label,
      score: row.score,
      relativeLikelihood: round1(row.adjustedRaw / total * 100),
      adjustmentPoints: round1(row.adjustmentPoints)
    }))
    .sort((a, b) => b.relativeLikelihood - a.relativeLikelihood || String(a.key).localeCompare(String(b.key)));
}

function summarize(rows) {
  const leader = rows[0] || null;
  const runnerUp = rows[1] || null;
  const gap = round1((leader?.relativeLikelihood || 0) - (runnerUp?.relativeLikelihood || 0));
  return {
    scenarios: rows,
    leader,
    runnerUp,
    likelihoodGap: gap,
    ambiguity: gap >= 25 ? "clear" : gap >= 12 ? "lean" : "mixed"
  };
}

function build(base, calibrationReport, context = {}) {
  const source = Array.isArray(base?.scenarios) ? base.scenarios : [];
  const candidates = approvedCandidates(calibrationReport);
  const bRows = normalize(source.map(row => {
    const adjustmentPoints = candidates.reduce(
      (sum, candidate) => sum + matchingAdjustment(candidate, { ...context, ambiguity: base?.ambiguity }, row),
      0
    );
    return {
      ...row,
      adjustmentPoints: Math.max(-5, Math.min(5, adjustmentPoints)),
      adjustedRaw: Number(row.relativeLikelihood || 0) + Math.max(-5, Math.min(5, adjustmentPoints))
    };
  }));
  const a = summarize(source.map(row => ({ ...row, adjustmentPoints: 0 })));
  const b = summarize(bRows);
  return {
    version: "5-shadow-ab-1",
    status: "shadow-only",
    applicationMode: "shadow-only",
    usableForPrediction: false,
    automaticApplication: false,
    candidateCount: candidates.length,
    changed: JSON.stringify(a.scenarios.map(row => row.relativeLikelihood)) !== JSON.stringify(b.scenarios.map(row => row.relativeLikelihood)),
    a,
    b
  };
}

module.exports = { build, matchingAdjustment };
