"use strict";

function direction(row, options) {
  const recovery = Number(row?.recoveryRate || 0);
  const scenario = Number(row?.scenarioMatchRate || 0);
  if (
    recovery >= options.raiseRecoveryRate &&
    scenario >= options.raiseScenarioMatchRate
  ) return "raise";
  if (
    recovery <= options.lowerRecoveryRate &&
    scenario <= options.lowerScenarioMatchRate
  ) return "lower";
  return "maintain";
}

function proposalFor(row, scope, options) {
  const minimumSamples = scope === "venue-theory"
    ? options.minimumVenueTheorySamples
    : options.minimumTheorySamples;
  const samples = Number(row?.raceCount || 0);
  if (samples < minimumSamples) {
    return {
      scope,
      key: String(row?.key || ""),
      theoryKey: String(row?.theoryKey || row?.key || ""),
      label: String(row?.label || row?.theoryKey || row?.key || ""),
      jcd: scope === "venue-theory" ? String(row?.jcd || "") : "",
      place: scope === "venue-theory" ? String(row?.place || "") : "",
      samples,
      action: "collect",
      status: "insufficient-samples",
      reason: `最低${minimumSamples}Rに未到達`,
      usableForPrediction: false,
      automaticApplication: false
    };
  }

  const action = direction(row, options);
  const reason = action === "raise"
    ? `回収率${row.recoveryRate}%・展開一致率${row.scenarioMatchRate}%が強化基準を満たす`
    : action === "lower"
      ? `回収率${row.recoveryRate}%・展開一致率${row.scenarioMatchRate}%が見直し基準以下`
      : `回収率${row.recoveryRate}%・展開一致率${row.scenarioMatchRate}%は現状維持範囲`;

  return {
    scope,
    key: String(row?.key || ""),
    theoryKey: String(row?.theoryKey || row?.key || ""),
    label: String(row?.label || row?.theoryKey || row?.key || ""),
    jcd: scope === "venue-theory" ? String(row?.jcd || "") : "",
    place: scope === "venue-theory" ? String(row?.place || "") : "",
    samples,
    hitRate: Number(row?.hitRate || 0),
    scenarioMatchRate: Number(row?.scenarioMatchRate || 0),
    recoveryRate: Number(row?.recoveryRate || 0),
    action,
    status: action === "maintain" ? "maintain" : "proposal-ready",
    reason,
    suggestedAdjustmentPoints:
      action === "raise" ? options.adjustmentPoints :
      action === "lower" ? -options.adjustmentPoints : 0,
    usableForPrediction: false,
    automaticApplication: false
  };
}

function build(performance, customOptions = {}) {
  const options = {
    minimumTheorySamples: 50,
    minimumVenueTheorySamples: 30,
    raiseRecoveryRate: 110,
    raiseScenarioMatchRate: 55,
    lowerRecoveryRate: 80,
    lowerScenarioMatchRate: 45,
    adjustmentPoints: 2,
    ...customOptions
  };
  const byTheory = (Array.isArray(performance?.byTheory) ? performance.byTheory : [])
    .map(row => proposalFor(row, "theory", options));
  const byVenueTheory = (Array.isArray(performance?.byVenueTheory) ? performance.byVenueTheory : [])
    .map(row => proposalFor(row, "venue-theory", options));
  const ready = [...byTheory, ...byVenueTheory].filter(row => row.status === "proposal-ready");

  return {
    version: "1.0.0",
    status: ready.length ? "proposals-ready" : "collecting-data",
    proposalOnly: true,
    usableForPrediction: false,
    automaticApplication: false,
    safeguards: options,
    proposalCount: ready.length,
    proposals: ready,
    byTheory,
    byVenueTheory
  };
}

module.exports = { direction, proposalFor, build };
