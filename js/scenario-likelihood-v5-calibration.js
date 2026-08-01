"use strict";

function round1(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function addBucket(map, key, row) {
  if (!key) return;
  const bucket = map.get(key) || {
    key,
    samples: 0,
    leaderHits: 0,
    topTwoHits: 0,
    expectedLeaderTotal: 0
  };
  bucket.samples += 1;
  bucket.leaderHits += row.leaderHit ? 1 : 0;
  bucket.topTwoHits += row.topTwoHit ? 1 : 0;
  bucket.expectedLeaderTotal += Number(row.leaderLikelihood || 0);
  map.set(key, bucket);
}

function finalize(map, minimumSamples) {
  return [...map.values()]
    .map(bucket => {
      const actualLeaderRate = bucket.samples
        ? bucket.leaderHits / bucket.samples * 100
        : 0;
      const expectedLeaderRate = bucket.samples
        ? bucket.expectedLeaderTotal / bucket.samples
        : 0;
      const gap = actualLeaderRate - expectedLeaderRate;
      return {
        ...bucket,
        leaderHitRate: round1(actualLeaderRate),
        topTwoHitRate: round1(
          bucket.samples
            ? bucket.topTwoHits / bucket.samples * 100
            : 0
        ),
        averageLeaderLikelihood: round1(expectedLeaderRate),
        calibrationGap: round1(gap),
        status: bucket.samples >= minimumSamples
          ? "review-ready"
          : "insufficient-samples",
        proposal: bucket.samples >= minimumSamples && Math.abs(gap) >= 8
          ? {
              action: gap > 0 ? "raise" : "lower",
              suggestedPoints: round1(Math.min(10, Math.abs(gap))),
              automaticApplication: false
            }
          : null
      };
    })
    .sort((a, b) => b.samples - a.samples || a.key.localeCompare(b.key));
}

function build(rows, options = {}) {
  const minimumSamples = Number(options.minimumSamples || 30);
  const comparable = (Array.isArray(rows) ? rows : [])
    .filter(row => row?.comparable === true);
  const byVenue = new Map();
  const byScenario = new Map();
  const byAmbiguity = new Map();
  const byVenueScenario = new Map();

  comparable.forEach(row => {
    const venue = String(row.jcd || row.venue || "").padStart(2, "0");
    const scenario = String(row.actualScenario || row.leaderScenario || "");
    const ambiguity = String(row.ambiguity || "unknown");
    addBucket(byVenue, venue, row);
    addBucket(byScenario, scenario, row);
    addBucket(byAmbiguity, ambiguity, row);
    addBucket(byVenueScenario, venue && scenario ? `${venue}:${scenario}` : "", row);
  });

  return {
    version: "1.0.0",
    status: "proposal-only",
    usableForPrediction: false,
    automaticApplication: false,
    minimumSamples,
    comparableCount: comparable.length,
    byVenue: finalize(byVenue, minimumSamples),
    byScenario: finalize(byScenario, minimumSamples),
    byAmbiguity: finalize(byAmbiguity, minimumSamples),
    byVenueScenario: finalize(byVenueScenario, minimumSamples)
  };
}

module.exports = { build };
