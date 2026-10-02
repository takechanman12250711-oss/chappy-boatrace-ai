"use strict";

const MIN_RACES = 100;

function pct(n, d) {
  return d ? Math.round((n / d) * 1000) / 10 : 0;
}

function classify(row) {
  if (Number(row?.raceCount || 0) < MIN_RACES) return "hold";
  const recovery = Number(row?.recoveryRate || 0);
  const hitRate = Number(row?.hitRate || 0);
  const scenario = Number(row?.scenarioMatchRate || 0);
  if (recovery >= 105 && hitRate >= 15 && scenario >= 45) return "candidate";
  if (recovery < 80 && hitRate < 10 && scenario < 35) return "reject";
  return "hold";
}

function build(report, improvementReport = {}) {
  const theories = (Array.isArray(report?.byTheory) ? report.byTheory : []).map(row => ({
    theoryKey: String(row?.theoryKey || row?.key || ""),
    label: String(row?.label || row?.theoryKey || ""),
    raceCount: Number(row?.raceCount || 0),
    useCount: Number(row?.useCount || 0),
    hitRate: Number(row?.hitRate || 0),
    recoveryRate: Number(row?.recoveryRate || 0),
    scenarioMatchRate: Number(row?.scenarioMatchRate || 0),
    profit: Number(row?.profit || 0),
    decision: classify(row),
    humanApprovalRequired: true,
    approved: false,
    usableForPrediction: false
  })).filter(row => row.theoryKey);

  const venueBreakdown = (Array.isArray(report?.byVenueTheory) ? report.byVenueTheory : []).map(row => ({
    key: String(row?.key || ""),
    theoryKey: String(row?.theoryKey || ""),
    jcd: String(row?.jcd || ""),
    place: String(row?.place || ""),
    raceCount: Number(row?.raceCount || 0),
    hitRate: Number(row?.hitRate || 0),
    recoveryRate: Number(row?.recoveryRate || 0),
    scenarioMatchRate: Number(row?.scenarioMatchRate || 0)
  }));

  const summary = {
    candidate: theories.filter(row => row.decision === "candidate").length,
    hold: theories.filter(row => row.decision === "hold").length,
    reject: theories.filter(row => row.decision === "reject").length
  };

  return {
    schemaVersion: 1,
    engineVersion: "theory-adoption-phase5-20260806",
    status: theories.length ? "review-ready" : "collecting-data",
    minimumRaceCount: MIN_RACES,
    theoryCount: theories.length,
    summary,
    theories,
    venueBreakdown,
    improvementProposalStatus: String(improvementReport?.status || "unknown"),
    decisionDefinitions: {
      candidate: "採用候補",
      hold: "保留",
      reject: "却下候補"
    },
    humanApprovalRequired: true,
    automaticApplication: false,
    usableForPrediction: false,
    uiVisible: false
  };
}

module.exports = { MIN_RACES, pct, classify, build };
