"use strict";

function n(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function approvedCandidates(report = {}) {
  return Array.isArray(report?.approvalGate?.approvedCandidates)
    ? report.approvalGate.approvedCandidates.filter(row => row?.approved === true)
    : [];
}

function adjustmentFor(scenario = {}, report = {}, context = {}) {
  const type = String(scenario?.scenarioType || "");
  const jcd = String(context?.jcd || "").padStart(2, "0");
  const candidates = approvedCandidates(report);
  const applied = [];

  candidates.forEach(candidate => {
    const scope = String(candidate?.scope || "");
    const key = String(candidate?.key || "");
    const adjustment = Math.max(-2, Math.min(2, n(candidate?.adjustment)));
    const matchesType = scope === "scenario-type" && key === type;
    const matchesVenue = scope === "venue-scenario-type" && key === `${jcd}:${type}`;
    if ((matchesType || matchesVenue) && adjustment !== 0) {
      applied.push({ scope, key, adjustment });
    }
  });

  const total = Math.max(-4, Math.min(4, applied.reduce((sum, row) => sum + row.adjustment, 0)));
  return { total, applied };
}

function normalize(rows = []) {
  const total = rows.reduce((sum, row) => sum + Math.max(0, n(row.adjustedRawScore)), 0);
  let used = 0;
  return rows.map((row, index) => {
    const likelihood = total
      ? (index === rows.length - 1
        ? Math.max(0, Math.round((100 - used) * 10) / 10)
        : Math.round(Math.max(0, n(row.adjustedRawScore)) / total * 1000) / 10)
      : 0;
    used = Math.round((used + likelihood) * 10) / 10;
    return { ...row, shadowLikelihood: likelihood };
  });
}

function build(snapshot = {}, report = {}, context = {}) {
  const source = Array.isArray(snapshot?.scenarios) ? snapshot.scenarios : [];
  const a = source.map(row => ({
    rank: n(row?.rank),
    scenarioType: String(row?.scenarioType || ""),
    likelihood: n(row?.likelihood),
    representativeTicket: String(row?.representativeTicket || "")
  }));

  const adjusted = source.map(row => {
    const adjustment = adjustmentFor(row, report, context);
    return {
      ...row,
      originalRank: n(row?.rank),
      originalLikelihood: n(row?.likelihood),
      adjustment: adjustment.total,
      appliedCandidates: adjustment.applied,
      adjustedRawScore: Math.max(0, n(row?.rawScore) + adjustment.total)
    };
  });

  const b = normalize(adjusted)
    .sort((left, right) => right.shadowLikelihood - left.shadowLikelihood || right.adjustedRawScore - left.adjustedRawScore || left.originalRank - right.originalRank)
    .map((row, index) => ({
      rank: index + 1,
      originalRank: row.originalRank,
      scenarioType: String(row?.scenarioType || ""),
      likelihood: row.shadowLikelihood,
      originalLikelihood: row.originalLikelihood,
      adjustment: row.adjustment,
      appliedCandidates: row.appliedCandidates,
      representativeTicket: String(row?.representativeTicket || "")
    }));

  const changed = a.some((row, index) => b[index]?.scenarioType !== row.scenarioType || n(b[index]?.likelihood) !== n(row.likelihood));

  return {
    version: "6.0.0-shadow-ab",
    status: source.length ? "shadow-ready" : "scenario-unavailable",
    a: { label: "current-v6", scenarios: a },
    b: { label: "approved-adjustment-shadow", scenarios: b },
    changed,
    appliedCandidateCount: b.reduce((sum, row) => sum + row.appliedCandidates.length, 0),
    applicationMode: "shadow-only",
    usableForPrediction: false,
    automaticApplication: false
  };
}

module.exports = { build, adjustmentFor, normalize };
