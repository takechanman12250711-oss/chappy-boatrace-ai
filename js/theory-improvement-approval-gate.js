"use strict";

const performance = require("./theory-performance-report");

function pct(n, d) {
  return d ? Math.round((n / d) * 1000) / 10 : 0;
}

function summarize(rows) {
  const races = new Set();
  let hits = 0;
  let scenarioHits = 0;
  let stake = 0;
  let returned = 0;
  rows.forEach(row => {
    races.add(String(row?.raceKey || ""));
    hits += row?.hit === true ? 1 : 0;
    scenarioHits += row?.scenarioHit === true ? 1 : 0;
    stake += Number(row?.stake || 0);
    returned += Number(row?.return || 0);
  });
  return {
    samples: races.size,
    hitRate: pct(hits, rows.length),
    scenarioMatchRate: pct(scenarioHits, rows.length),
    recoveryRate: pct(returned, stake)
  };
}

function direction(summary, options) {
  if (
    summary.recoveryRate >= options.raiseRecoveryRate &&
    summary.scenarioMatchRate >= options.raiseScenarioMatchRate
  ) return "raise";
  if (
    summary.recoveryRate <= options.lowerRecoveryRate &&
    summary.scenarioMatchRate <= options.lowerScenarioMatchRate
  ) return "lower";
  return "maintain";
}

function evaluateGroup(rows, descriptor, options) {
  const sorted = [...rows].sort((a, b) =>
    String(a?.raceKey || "").localeCompare(String(b?.raceKey || ""))
  );
  const splitAt = Math.floor(sorted.length / 2);
  const first = summarize(sorted.slice(0, splitAt));
  const second = summarize(sorted.slice(splitAt));
  const firstDirection = direction(first, options);
  const secondDirection = direction(second, options);
  const minimumHalfSamples = descriptor.scope === "venue-theory"
    ? options.minimumVenueHalfSamples
    : options.minimumTheoryHalfSamples;
  const enough = first.samples >= minimumHalfSamples && second.samples >= minimumHalfSamples;
  const sameDirection = firstDirection === secondDirection;
  const actionable = firstDirection === "raise" || firstDirection === "lower";
  const recoveryGap = Math.abs(first.recoveryRate - second.recoveryRate);
  const scenarioGap = Math.abs(first.scenarioMatchRate - second.scenarioMatchRate);
  const approved =
    enough &&
    sameDirection &&
    actionable &&
    recoveryGap <= options.maximumRecoveryRateGap &&
    scenarioGap <= options.maximumScenarioMatchGap;

  return {
    ...descriptor,
    status: approved ? "approved-candidate" : "not-approved",
    approved,
    action: approved ? firstDirection : "collect",
    suggestedAdjustmentPoints: approved
      ? (firstDirection === "raise" ? options.adjustmentPoints : -options.adjustmentPoints)
      : 0,
    firstHalf: { ...first, direction: firstDirection },
    secondHalf: { ...second, direction: secondDirection },
    recoveryRateGap: recoveryGap,
    scenarioMatchRateGap: scenarioGap,
    reason: !enough
      ? `前半・後半とも最低${minimumHalfSamples}Rが必要`
      : !sameDirection
        ? "前半と後半で提案方向が一致しない"
        : !actionable
          ? "前半・後半とも現状維持範囲"
          : recoveryGap > options.maximumRecoveryRateGap
            ? "前半・後半の回収率差が許容範囲外"
            : scenarioGap > options.maximumScenarioMatchGap
              ? "前半・後半の展開一致率差が許容範囲外"
              : "再現性条件を満たす",
    usableForPrediction: false,
    automaticApplication: false
  };
}

function build(records, customOptions = {}) {
  const options = {
    minimumTheoryHalfSamples: 25,
    minimumVenueHalfSamples: 15,
    raiseRecoveryRate: 110,
    raiseScenarioMatchRate: 55,
    lowerRecoveryRate: 80,
    lowerScenarioMatchRate: 45,
    maximumRecoveryRateGap: 25,
    maximumScenarioMatchGap: 12,
    adjustmentPoints: 2,
    ...customOptions
  };
  const rows = performance.buildRows(records).filter(row =>
    row?.used === true &&
    row?.evaluated === true &&
    Number(row?.ticketCount || 0) > 0
  );
  const theoryGroups = new Map();
  const venueGroups = new Map();
  rows.forEach(row => {
    const theoryKey = String(row.theoryKey || "");
    if (!theoryGroups.has(theoryKey)) theoryGroups.set(theoryKey, []);
    theoryGroups.get(theoryKey).push(row);
    const venueKey = `${row.jcd}:${theoryKey}`;
    if (!venueGroups.has(venueKey)) venueGroups.set(venueKey, []);
    venueGroups.get(venueKey).push(row);
  });
  const byTheory = [...theoryGroups.entries()].map(([key, group]) =>
    evaluateGroup(group, {
      scope: "theory",
      key,
      theoryKey: key,
      label: group[0]?.label || key,
      jcd: "",
      place: ""
    }, options)
  );
  const byVenueTheory = [...venueGroups.entries()].map(([key, group]) =>
    evaluateGroup(group, {
      scope: "venue-theory",
      key,
      theoryKey: group[0]?.theoryKey || "",
      label: group[0]?.label || "",
      jcd: group[0]?.jcd || "",
      place: group[0]?.place || ""
    }, options)
  );
  const approvedCandidates = [...byTheory, ...byVenueTheory].filter(row => row.approved);
  return {
    version: "1.0.0",
    status: approvedCandidates.length ? "approved-candidates-ready" : "collecting-data",
    approvedCandidateCount: approvedCandidates.length,
    approvedCandidates,
    byTheory,
    byVenueTheory,
    safeguards: options,
    applicationMode: "shadow-only",
    usableForPrediction: false,
    automaticApplication: false
  };
}

module.exports = { summarize, direction, evaluateGroup, build };
