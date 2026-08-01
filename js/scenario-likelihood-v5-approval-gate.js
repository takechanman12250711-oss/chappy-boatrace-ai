"use strict";

function round1(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function dateKey(row) {
  const match = String(row?.raceKey || "").match(/^(\d{8})/);
  return match ? match[1] : "";
}

function summarize(rows) {
  const source = Array.isArray(rows) ? rows : [];
  const samples = source.length;
  const leaderHits = source.filter(row => row?.leaderHit === true).length;
  const expected = source.reduce(
    (total, row) => total + Number(row?.leaderLikelihood || 0),
    0
  );
  const hitRate = samples ? leaderHits / samples * 100 : 0;
  const expectedRate = samples ? expected / samples : 0;
  return {
    samples,
    leaderHitRate: round1(hitRate),
    averageLeaderLikelihood: round1(expectedRate),
    calibrationGap: round1(hitRate - expectedRate)
  };
}

function splitChronologically(rows) {
  const source = [...(Array.isArray(rows) ? rows : [])].sort((a, b) =>
    dateKey(a).localeCompare(dateKey(b)) ||
    String(a?.raceKey || "").localeCompare(String(b?.raceKey || ""))
  );
  const middle = Math.floor(source.length / 2);
  return [source.slice(0, middle), source.slice(middle)];
}

function direction(gap, minimumGap) {
  if (gap >= minimumGap) return "raise";
  if (gap <= -minimumGap) return "lower";
  return "none";
}

function evaluateBucket(key, rows, options = {}) {
  const minimumSamples = Number(options.minimumSamples || 100);
  const minimumHalfSamples = Number(options.minimumHalfSamples || 25);
  const minimumGap = Number(options.minimumGap || 8);
  const maximumHalfGapDifference = Number(
    options.maximumHalfGapDifference || 8
  );
  const maximumAdjustmentPoints = Number(
    options.maximumAdjustmentPoints || 5
  );

  const total = summarize(rows);
  const [firstRows, secondRows] = splitChronologically(rows);
  const firstHalf = summarize(firstRows);
  const secondHalf = summarize(secondRows);
  const totalDirection = direction(total.calibrationGap, minimumGap);
  const firstDirection = direction(firstHalf.calibrationGap, minimumGap / 2);
  const secondDirection = direction(secondHalf.calibrationGap, minimumGap / 2);
  const stableDirection =
    totalDirection !== "none" &&
    firstDirection === totalDirection &&
    secondDirection === totalDirection;
  const halfGapDifference = round1(
    Math.abs(firstHalf.calibrationGap - secondHalf.calibrationGap)
  );

  const reasonCodes = [];
  if (total.samples < minimumSamples) reasonCodes.push("insufficient_samples");
  if (
    firstHalf.samples < minimumHalfSamples ||
    secondHalf.samples < minimumHalfSamples
  ) reasonCodes.push("insufficient_half_samples");
  if (totalDirection === "none") reasonCodes.push("gap_below_threshold");
  if (!stableDirection) reasonCodes.push("direction_not_stable");
  if (halfGapDifference > maximumHalfGapDifference) {
    reasonCodes.push("half_gap_unstable");
  }

  const approved = reasonCodes.length === 0;
  return {
    key,
    approved,
    status: approved ? "approved-for-shadow-application" : "not-approved",
    action: approved ? totalDirection : "none",
    adjustmentPoints: approved
      ? round1(
          Math.min(
            maximumAdjustmentPoints,
            Math.abs(total.calibrationGap)
          )
        )
      : 0,
    samples: total.samples,
    total,
    firstHalf,
    secondHalf,
    halfGapDifference,
    stableDirection,
    reasonCodes,
    applicationMode: approved ? "shadow-only" : "none",
    usableForPrediction: false,
    automaticApplication: false
  };
}

function groupRows(rows, keyBuilder) {
  const groups = new Map();
  (Array.isArray(rows) ? rows : [])
    .filter(row => row?.comparable === true)
    .forEach(row => {
      const key = keyBuilder(row);
      if (!key) return;
      const bucket = groups.get(key) || [];
      bucket.push(row);
      groups.set(key, bucket);
    });
  return groups;
}

function evaluateGroups(groups, options) {
  return [...groups.entries()]
    .map(([key, rows]) => evaluateBucket(key, rows, options))
    .sort((a, b) => b.samples - a.samples || a.key.localeCompare(b.key));
}

function build(rows, options = {}) {
  const source = (Array.isArray(rows) ? rows : [])
    .filter(row => row?.comparable === true);
  const byVenue = evaluateGroups(
    groupRows(source, row => String(row.jcd || "").padStart(2, "0")),
    {
      ...options,
      minimumSamples: Number(options.minimumVenueSamples || 100)
    }
  );
  const byScenario = evaluateGroups(
    groupRows(source, row => String(row.actualScenario || row.leaderScenario || "")),
    {
      ...options,
      minimumSamples: Number(options.minimumScenarioSamples || 50)
    }
  );
  const byAmbiguity = evaluateGroups(
    groupRows(source, row => String(row.ambiguity || "unknown")),
    {
      ...options,
      minimumSamples: Number(options.minimumAmbiguitySamples || 100)
    }
  );
  const byVenueScenario = evaluateGroups(
    groupRows(source, row => {
      const venue = String(row.jcd || "").padStart(2, "0");
      const scenario = String(row.actualScenario || row.leaderScenario || "");
      return venue && scenario ? `${venue}:${scenario}` : "";
    }),
    {
      ...options,
      minimumSamples: Number(options.minimumVenueScenarioSamples || 100)
    }
  );
  const all = [
    ...byVenue.map(item => ({ ...item, scope: "venue" })),
    ...byScenario.map(item => ({ ...item, scope: "scenario" })),
    ...byAmbiguity.map(item => ({ ...item, scope: "ambiguity" })),
    ...byVenueScenario.map(item => ({ ...item, scope: "venue-scenario" }))
  ];
  const approvedCandidates = all.filter(item => item.approved);

  return {
    version: "1.0.0",
    status: approvedCandidates.length
      ? "shadow-application-candidates-ready"
      : "collecting-data",
    comparableCount: source.length,
    approvedCandidateCount: approvedCandidates.length,
    approvedCandidates,
    byVenue,
    byScenario,
    byAmbiguity,
    byVenueScenario,
    safeguards: {
      minimumVenueSamples: Number(options.minimumVenueSamples || 100),
      minimumScenarioSamples: Number(options.minimumScenarioSamples || 50),
      minimumVenueScenarioSamples: Number(
        options.minimumVenueScenarioSamples || 100
      ),
      minimumHalfSamples: Number(options.minimumHalfSamples || 25),
      minimumGap: Number(options.minimumGap || 8),
      maximumHalfGapDifference: Number(
        options.maximumHalfGapDifference || 8
      ),
      maximumAdjustmentPoints: Number(
        options.maximumAdjustmentPoints || 5
      )
    },
    applicationMode: "shadow-only",
    usableForPrediction: false,
    automaticApplication: false
  };
}

module.exports = {
  summarize,
  splitChronologically,
  evaluateBucket,
  build
};
