"use strict";

const DEFAULT_BASELINE_RACES = 457;
const DEFAULT_WARNING_AFTER_NEW_RACES = 30;

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function build(current = {}, previous = {}, options = {}) {
  const baselineRaceCount = finite(
    previous?.currentRaceCount ||
    previous?.baselineRaceCount ||
    options.baselineRaceCount ||
    DEFAULT_BASELINE_RACES
  );
  const currentRaceCount = Math.max(
    0,
    ...((Array.isArray(current?.theories) ? current.theories : []).map(row => finite(row?.raceCount)))
  );
  const warningAfterNewRaces = finite(options.warningAfterNewRaces) || DEFAULT_WARNING_AFTER_NEW_RACES;
  const newRaceCount = Math.max(0, currentRaceCount - baselineRaceCount);

  const previousMap = new Map(
    (Array.isArray(previous?.theories) ? previous.theories : [])
      .map(row => [String(row?.theoryKey || ""), row])
      .filter(([key]) => key)
  );

  const theories = (Array.isArray(current?.theories) ? current.theories : []).map(row => {
    const theoryKey = String(row?.theoryKey || "");
    const prior = previousMap.get(theoryKey) || {};
    const evaluatedCount = finite(row?.evaluatedCount);
    const previousEvaluatedCount = finite(prior?.evaluatedCount);
    const growth = Math.max(0, evaluatedCount - previousEvaluatedCount);
    const previouslyMissing = prior?.status === "formal-evidence-missing" || previousEvaluatedCount === 0;
    const shouldWarn = newRaceCount >= warningAfterNewRaces && previouslyMissing && growth === 0;
    return {
      theoryKey,
      label: String(row?.label || theoryKey),
      evaluatedCount,
      previousEvaluatedCount,
      growth,
      status: shouldWarn ? "stagnant-warning" : growth > 0 ? "growing" : "waiting",
      warning: shouldWarn
    };
  });

  const warnings = theories.filter(row => row.warning);
  return {
    schemaVersion: 1,
    engineVersion: "theory-evidence-growth-monitor-20260807",
    status: warnings.length ? "warning" : "healthy",
    baselineRaceCount,
    currentRaceCount,
    newRaceCount,
    warningAfterNewRaces,
    warningCount: warnings.length,
    warningTheoryKeys: warnings.map(row => row.theoryKey),
    theories,
    humanApprovalRequired: true,
    automaticApplication: false,
    usableForPrediction: false,
    uiVisible: false
  };
}

module.exports = {
  DEFAULT_BASELINE_RACES,
  DEFAULT_WARNING_AFTER_NEW_RACES,
  build
};
