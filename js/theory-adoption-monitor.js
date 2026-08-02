"use strict";

function pct(n, d) {
  return d ? Math.round((Number(n) || 0) / d * 1000) / 10 : 0;
}

function build(rollout = {}, abReport = {}, options = {}) {
  const cfg = {
    minimumComparable: 20,
    maximumAWinRate: 40,
    minimumBAdvantagePoints: 0,
    maximumHarmfulVenueCount: 0,
    ...options
  };
  const overall = abReport?.overall || {};
  const comparableCount = Number(overall.comparableCount || 0);
  const bWins = Number(overall.bWins || 0);
  const aWins = Number(overall.aWins || 0);
  const bWinRate = Number(overall.bWinRate ?? pct(bWins, comparableCount));
  const aWinRate = Number(overall.aWinRate ?? pct(aWins, comparableCount));
  const advantagePoints = Math.round((bWinRate - aWinRate) * 10) / 10;
  const harmfulVenueCount = (Array.isArray(abReport?.byVenueTheory) ? abReport.byVenueTheory : [])
    .filter(row => Number(row?.comparableCount || 0) >= 10 && Number(row?.aWinRate || 0) > cfg.maximumAWinRate)
    .length;
  const active = rollout?.enabled === true && rollout?.stage === "canary" && Number(rollout?.rolloutPercent || 0) > 0;
  const checks = {
    rolloutActive: active,
    enoughComparable: comparableCount >= cfg.minimumComparable,
    bNotLosing: advantagePoints >= cfg.minimumBAdvantagePoints,
    aWinRateAcceptable: aWinRate <= cfg.maximumAWinRate,
    noHarmfulVenue: harmfulVenueCount <= cfg.maximumHarmfulVenueCount
  };
  const evaluated = active && checks.enoughComparable;
  const stopRequested = evaluated && (!checks.bNotLosing || !checks.aWinRateAcceptable || !checks.noHarmfulVenue);
  return {
    version: "1.0.0",
    status: !active ? "inactive" : !checks.enoughComparable ? "collecting-canary-evidence" : stopRequested ? "stop-requested" : "healthy",
    active,
    evaluated,
    stopRequested,
    rollbackRecommended: stopRequested,
    checks,
    thresholds: cfg,
    metrics: { comparableCount, bWins, aWins, bWinRate, aWinRate, advantagePoints, harmfulVenueCount },
    automaticStopApplication: false,
    automaticApplication: false,
    usableForPrediction: false
  };
}

module.exports = { build, pct };
