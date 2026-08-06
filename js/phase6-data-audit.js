"use strict";

function recordKey(record) {
  return String(record?.raceKey || [record?.date, record?.jcd, record?.rno].filter(Boolean).join("-") || "");
}

function build(records, reports = {}) {
  const settled = (Array.isArray(records) ? records : []).filter(row => row?.result?.settled === true);
  const seen = new Map();
  const issues = [];
  let theoryReady = 0;
  let missReady = 0;

  settled.forEach(record => {
    const key = recordKey(record);
    if (key) seen.set(key, (seen.get(key) || 0) + 1);
    const evaluation = record?.theoryEvaluationSnapshot;
    const miss = record?.result?.missCauseAnalysis;
    const hit = record?.result?.practicalHit === true || record?.result?.review?.practicalHit === true;

    if (evaluation?.evaluations?.length === 12) theoryReady += 1;
    else issues.push({ code: "missing-theory-evaluation", raceKey: key });

    if (miss) missReady += 1;
    else issues.push({ code: "missing-miss-cause-analysis", raceKey: key });

    if (hit && Array.isArray(miss?.candidates) && miss.candidates.length > 0) {
      issues.push({ code: "hit-classified-as-miss", raceKey: key });
    }
    if (evaluation?.automaticApplication !== false || evaluation?.usableForPrediction !== false || evaluation?.uiVisible !== false) {
      issues.push({ code: "unsafe-theory-evaluation-flags", raceKey: key });
    }
    if (miss && (miss.automaticApplication !== false || miss.usableForPrediction !== false || miss.uiVisible !== false)) {
      issues.push({ code: "unsafe-miss-analysis-flags", raceKey: key });
    }
  });

  [...seen.entries()].filter(([, count]) => count > 1).forEach(([raceKey, count]) => {
    issues.push({ code: "duplicate-race", raceKey, count });
  });

  const improvement = reports.improvement || {};
  const adoption = reports.adoption || {};
  const pipeline = reports.pipeline || {};
  const under100 = settled.length < 100;

  if (under100 && Array.isArray(improvement.proposals) && improvement.proposals.length > 0) {
    issues.push({ code: "proposal-before-100-races" });
  }
  if (adoption.automaticApplication !== false || adoption.usableForPrediction !== false || adoption.humanApprovalRequired !== true) {
    issues.push({ code: "unsafe-adoption-flags" });
  }
  if (Array.isArray(adoption.theories) && adoption.theories.some(row => row?.approved === true || row?.usableForPrediction === true)) {
    issues.push({ code: "unapproved-theory-enabled" });
  }
  if (pipeline.status && pipeline.status !== "blocked" && pipeline.automaticApplication !== false) {
    issues.push({ code: "unsafe-pipeline-flags" });
  }

  const counts = issues.reduce((map, issue) => {
    map[issue.code] = (map[issue.code] || 0) + 1;
    return map;
  }, {});

  return {
    schemaVersion: 1,
    engineVersion: "phase6-data-audit-20260806",
    status: issues.length ? "attention-required" : "healthy",
    settledRaceCount: settled.length,
    theoryEvaluationCoverage: settled.length ? Math.round(theoryReady / settled.length * 1000) / 10 : 0,
    missCauseCoverage: settled.length ? Math.round(missReady / settled.length * 1000) / 10 : 0,
    duplicateRaceCount: counts["duplicate-race"] || 0,
    issueCount: issues.length,
    issueCounts: counts,
    issues,
    humanApprovalRequired: true,
    automaticApplication: false,
    usableForPrediction: false,
    uiVisible: false
  };
}

module.exports = { recordKey, build };
