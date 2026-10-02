"use strict";

const VERSION = "6.1.0-shadow-ab";
const LOGIC_FINGERPRINT = "scenario-ai-v6-ab-decision-v1";

function n(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function approvedCandidates(report = {}) {
  return Array.isArray(report?.approvalGate?.approvedCandidates)
    ? report.approvalGate.approvedCandidates.filter(row => row?.approved === true)
    : [];
}

function candidateSetFingerprint(report = {}) {
  const rows = approvedCandidates(report)
    .map(row => ({
      scope: String(row?.scope || ""),
      key: String(row?.key || ""),
      adjustment: Math.max(-2, Math.min(2, n(row?.adjustment)))
    }))
    .filter(row => row.scope && row.key && row.adjustment !== 0)
    .sort((left, right) =>
      left.scope.localeCompare(right.scope) ||
      left.key.localeCompare(right.key) ||
      left.adjustment - right.adjustment
    );

  return rows.length
    ? rows.map(row => `${row.scope}:${row.key}:${row.adjustment}`).join("|")
    : "none";
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

function normalizedOrder(value) {
  const order = Array.isArray(value)
    ? value.map(Number).slice(0, 3)
    : [];
  return order.length === 3 &&
    order.every(boat => boat >= 1 && boat <= 6) &&
    new Set(order).size === 3
    ? order
    : [];
}

function sameOrder(left, right) {
  const a = normalizedOrder(left);
  const b = normalizedOrder(right);
  if (!a.length && !b.length) return true;
  return a.length === 3 &&
    b.length === 3 &&
    a.every((boat, index) => boat === b[index]);
}

function build(snapshot = {}, report = {}, context = {}) {
  const source = Array.isArray(snapshot?.scenarios) ? snapshot.scenarios : [];
  const a = source.map(row => ({
    rank: n(row?.rank),
    scenarioType: String(row?.scenarioType || ""),
    likelihood: n(row?.likelihood),
    keyBoat: Number(row?.keyBoat || 0) || null,
    finishOrder: normalizedOrder(row?.finishOrder),
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
      keyBoat: Number(row?.keyBoat || 0) || null,
      finishOrder: normalizedOrder(row?.finishOrder),
      representativeTicket: String(row?.representativeTicket || "")
    }));

  const rawDistributionChanged =
    a.length !== b.length ||
    a.some((row, index) =>
      b[index]?.scenarioType !== row.scenarioType ||
      n(b[index]?.likelihood) !== n(row.likelihood) ||
      !sameOrder(b[index]?.finishOrder, row.finishOrder) ||
      b[index]?.representativeTicket !== row.representativeTicket
    );
  const rawDecisionChanged = Boolean(
    a[0] &&
    b[0] &&
    (
      b[0].scenarioType !== a[0].scenarioType ||
      !sameOrder(b[0].finishOrder, a[0].finishOrder) ||
      b[0].representativeTicket !== a[0].representativeTicket
    )
  );
  const appliedCandidateCount = b.reduce(
    (sum, row) => sum + row.appliedCandidates.length,
    0
  );
  const candidateFingerprint = candidateSetFingerprint(report);
  const sourceLogicFingerprint = String(snapshot?.logicFingerprint || "");
  const inputSourceKind = String(snapshot?.inputSourceKind || "unknown");
  const candidateTraining = report?.trainingCohort || {};
  const candidateTrainingFingerprint = String(candidateTraining?.fingerprint || "none");
  const candidateGeneratedAt = String(report?.generatedAt || "");
  const candidateTrainingCutoff = candidateGeneratedAt;
  const candidateTrainingInputSourceKind = String(candidateTraining?.inputSourceKind || "");
  const capturedAt = String(context?.selectedAt || "");
  const trainingCutoffTime = Date.parse(candidateTrainingCutoff);
  const capturedTime = Date.parse(capturedAt);
  const candidateTemporalEligible =
    Number.isFinite(trainingCutoffTime) &&
    Number.isFinite(capturedTime) &&
    capturedTime > trainingCutoffTime;
  const candidateSourceEligible =
    Boolean(inputSourceKind) &&
    inputSourceKind !== "unknown" &&
    candidateTrainingInputSourceKind === inputSourceKind;
  const cohortKey = [
    sourceLogicFingerprint || "unknown",
    inputSourceKind,
    candidateFingerprint,
    candidateTrainingFingerprint
  ].join("|");
  const hasAlternatives = source.length >= 2;
  const hasCandidateSet = candidateFingerprint !== "none";
  const variantEligible =
    hasAlternatives &&
    hasCandidateSet &&
    candidateTrainingFingerprint !== "none" &&
    candidateSourceEligible &&
    candidateTemporalEligible &&
    appliedCandidateCount > 0;
  const distributionChanged = variantEligible && rawDistributionChanged;
  const decisionChanged = variantEligible && rawDecisionChanged;
  const scoreableDecision = Boolean(
    a[0] &&
    b[0] &&
    normalizedOrder(a[0].finishOrder).length === 3 &&
    normalizedOrder(b[0].finishOrder).length === 3 &&
    !sameOrder(a[0].finishOrder, b[0].finishOrder)
  );
  const comparisonReady = decisionChanged && scoreableDecision;
  const status = !source.length
    ? "scenario-unavailable"
    : !hasAlternatives
      ? "alternative-unavailable"
      : !hasCandidateSet
        ? "candidate-unavailable"
        : candidateTrainingFingerprint === "none" || !candidateTrainingCutoff
          ? "training-cohort-unavailable"
          : !candidateSourceEligible
            ? "candidate-source-mismatch"
            : !candidateTemporalEligible
              ? "candidate-not-yet-eligible"
              : appliedCandidateCount === 0
                ? "candidate-not-applicable"
                : "shadow-ready";

  return {
    version: VERSION,
    logicFingerprint: LOGIC_FINGERPRINT,
    sourceLogicFingerprint,
    inputSourceKind,
    candidateSetFingerprint: candidateFingerprint,
    candidateTrainingFingerprint,
    candidateGeneratedAt,
    candidateTrainingCutoff,
    candidateTrainingInputSourceKind,
    capturedAt,
    candidateTemporalEligible,
    candidateSourceEligible,
    cohortKey,
    status,
    a: { label: "current-v6", scenarios: a },
    b: { label: "approved-adjustment-shadow", scenarios: b },
    changed: distributionChanged,
    decisionChanged,
    distributionChanged,
    scoreableDecision,
    comparisonReady,
    variantEligible,
    appliedCandidateCount,
    applicationMode: "shadow-only",
    usableForPrediction: false,
    automaticApplication: false
  };
}

module.exports = {
  VERSION,
  LOGIC_FINGERPRINT,
  build,
  adjustmentFor,
  normalize,
  normalizedOrder,
  sameOrder,
  approvedCandidates,
  candidateSetFingerprint
};
