"use strict";

const crypto = require("node:crypto");

const FOCUS_VENUES = Object.freeze([
  ["01", "桐生", "loss-focus"],
  ["18", "徳山", "loss-focus"],
  ["16", "児島", "mixed-focus"],
  ["02", "戸田", "positive-control"],
  ["20", "若松", "positive-control"]
]);

const MIN_DRIVER_THEORIES = 3;

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function median(values) {
  const rows = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!rows.length) return null;
  const middle = Math.floor(rows.length / 2);
  return rows.length % 2 ? rows[middle] : Math.round((rows[middle - 1] + rows[middle]) * 5) / 10;
}

function groupDrivers(rows = []) {
  const groups = new Map();
  for (const row of rows) {
    const key = String(row.scenarioKey || "");
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

function compactDriver(row = {}) {
  return {
    theoryKey: String(row.theoryKey || ""),
    label: String(row.label || row.theoryKey || ""),
    evaluatedCount: Number(row.evaluatedCount || 0),
    practicalHitRate: numberOrNull(row.practicalHitRate),
    recoveryRate: numberOrNull(row.recoveryRate),
    profit: Number(row.profit || 0),
    classification: String(row.classification || "")
  };
}

function summarizeCluster(venue, scenarioKey, rows, direction) {
  const compact = rows.map(compactDriver);
  const scenarioLabel = String(rows[0]?.scenarioLabel || scenarioKey);
  return {
    jcd: venue.jcd,
    place: venue.place,
    scenarioKey,
    scenarioLabel,
    direction,
    theoryCount: new Set(compact.map(row => row.theoryKey)).size,
    evaluatedCountRange: {
      minimum: Math.min(...compact.map(row => row.evaluatedCount)),
      maximum: Math.max(...compact.map(row => row.evaluatedCount))
    },
    medianRecoveryRate: median(compact.map(row => row.recoveryRate)),
    medianPracticalHitRate: median(compact.map(row => row.practicalHitRate)),
    theoryRows: compact
  };
}

function fingerprint(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function evidenceSummary(report = {}) {
  return {
    source: "data/stats/race-flow-2course-sashi-skip-ab-report.json",
    version: report.version || null,
    generatedAt: report.generatedAt || null,
    targetLabel: report.targetLabel || null,
    targetSettledCount: Number(report?.cohort?.targetSettledCount || 0),
    deltaRecoveryRate: numberOrNull(report?.delta?.recoveryRate),
    deltaHitRate: numberOrNull(report?.delta?.hitRate),
    adoptionDecisionReady: report?.interpretation?.adoptionDecisionReady === true,
    usableForPrediction: report?.interpretation?.usableForPrediction === true
  };
}

function buildDiscoveryCandidate(cluster, sashiEvidence) {
  const hasExistingFixedRule =
    cluster.scenarioKey === "sashi" &&
    sashiEvidence.targetLabel === "2コース差し" &&
    sashiEvidence.targetSettledCount > 0;
  const fixedDefinition = hasExistingFixedRule
    ? `At venue ${cluster.jcd} (${cluster.place}), keep current A and compare a shadow B that skips purchase only when the stored pre-deadline scenario label is exactly 2コース差し. The existing ticket set and all other races remain unchanged.`
    : null;
  const basis = {
    jcd: cluster.jcd,
    scenarioKey: cluster.scenarioKey,
    direction: cluster.direction,
    fixedDefinition
  };
  return {
    candidateId: `venue-scenario-${cluster.jcd}-${cluster.scenarioKey}-v1`,
    candidateFingerprint: fingerprint(basis),
    discoveryEvidence: cluster,
    existingFixedCounterfactual: hasExistingFixedRule ? sashiEvidence : null,
    phase8Eligibility: {
      state: hasExistingFixedRule ? "INSUFFICIENT_EVIDENCE" : "NO_CANDIDATE",
      reason: hasExistingFixedRule
        ? "POSTHOC_VENUE_SCOPE_REQUIRES_INDEPENDENT_PROSPECTIVE_HOLDOUT"
        : "NO_EXISTING_FIXED_STANDALONE_COUNTERFACTUAL",
      eligibleForValidation: false,
      nextAction: hasExistingFixedRule
        ? "PREREGISTER_VENUE_SCOPED_PROSPECTIVE_SHADOW"
        : "DIAGNOSE_RACE_LEVEL_CONFOUNDERS_BEFORE_CANDIDATE"
    },
    antiPosthoc: {
      discoveryAndValidationSeparated: true,
      retrospectiveRowsUsableForValidation: false,
      productionChangeAllowed: false
    }
  };
}

function focusSummary(profile = {}) {
  const venues = Array.isArray(profile.venues) ? profile.venues : [];
  return FOCUS_VENUES.map(([jcd, place, role]) => {
    const venue = venues.find(row => String(row.jcd).padStart(2, "0") === jcd);
    return {
      jcd,
      place,
      role,
      present: Boolean(venue),
      eligibleTheoryCount: Number(venue?.eligibleTheoryCount || 0),
      strongTheoryCount: Array.isArray(venue?.strongTheories) ? venue.strongTheories.length : 0,
      watchTheoryCount: Array.isArray(venue?.watchTheories) ? venue.watchTheories.length : 0,
      weakTheoryCount: Array.isArray(venue?.weakTheories) ? venue.weakTheories.length : 0,
      strongestTheory: venue?.strongestTheory || null,
      weakestTheory: venue?.weakestTheory || null
    };
  });
}

function build(profile = {}, evidence = {}) {
  const venues = Array.isArray(profile.venues) ? profile.venues : [];
  const lossClusters = [];
  const positiveControls = [];

  for (const venue of venues) {
    for (const [scenarioKey, rows] of groupDrivers(venue.lossDrivers)) {
      const cluster = summarizeCluster(venue, scenarioKey, rows, "LOSS");
      if (cluster.theoryCount >= MIN_DRIVER_THEORIES) lossClusters.push(cluster);
    }
    for (const [scenarioKey, rows] of groupDrivers(venue.profitDrivers)) {
      const cluster = summarizeCluster(venue, scenarioKey, rows, "PROFIT");
      if (cluster.theoryCount >= MIN_DRIVER_THEORIES) positiveControls.push(cluster);
    }
  }

  lossClusters.sort((a, b) =>
    (a.medianRecoveryRate ?? 999) - (b.medianRecoveryRate ?? 999) ||
    b.theoryCount - a.theoryCount ||
    a.jcd.localeCompare(b.jcd)
  );
  positiveControls.sort((a, b) =>
    (b.medianRecoveryRate ?? -1) - (a.medianRecoveryRate ?? -1) ||
    b.theoryCount - a.theoryCount ||
    a.jcd.localeCompare(b.jcd)
  );

  const sashiEvidence = evidenceSummary(evidence.twoCourseSashiSkip || {});
  const discoveryCandidates = lossClusters.map(cluster =>
    buildDiscoveryCandidate(cluster, sashiEvidence)
  );

  return {
    schemaVersion: 1,
    analysisId: "venue-scenario-improvement-candidates-v1",
    generatedAt: new Date().toISOString(),
    sourceGeneratedAt: profile.generatedAt || null,
    source: "data/stats/venue-theory-profile.json",
    analysisInputContract: profile.analysisInputContract || null,
    productionChanged: false,
    automaticProductionChange: false,
    usableForPrediction: false,
    metricWarning: "同一レースを複数理論が評価するため、理論別の利益・損失は合算しない。",
    discoveryPolicy: {
      minimumDriverTheories: MIN_DRIVER_THEORIES,
      heuristicIsValidationGate: false,
      retrospectiveDiscoveryOnly: true,
      independentProspectiveHoldoutRequired: true,
      automaticPhase8Handoff: false
    },
    focusVenues: focusSummary(profile),
    existingEvidence: {
      twoCourseSashiSkip: sashiEvidence
    },
    lossClusters,
    positiveControls,
    discoveryCandidates,
    phase8HandoffSummary: {
      eligibleForValidation: discoveryCandidates.filter(row => row.phase8Eligibility.eligibleForValidation).length,
      insufficientEvidence: discoveryCandidates.filter(row => row.phase8Eligibility.state === "INSUFFICIENT_EVIDENCE").length,
      noCandidate: discoveryCandidates.filter(row => row.phase8Eligibility.state === "NO_CANDIDATE").length,
      productionChanged: false
    },
    limitations: [
      "高配当1件への依存はこの集約レポートだけでは確定できないため、レース単位の将来holdoutで確認する。",
      "同じ発見期間で選んだ場と条件を正式検証へ流用しない。",
      "オッズは候補の作成・削除条件に使わない。"
    ]
  };
}

module.exports = {
  FOCUS_VENUES,
  MIN_DRIVER_THEORIES,
  median,
  groupDrivers,
  summarizeCluster,
  evidenceSummary,
  buildDiscoveryCandidate,
  focusSummary,
  build
};
