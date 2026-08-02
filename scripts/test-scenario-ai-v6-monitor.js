"use strict";

const assert = require("node:assert/strict");
const monitor = require("../js/scenario-ai-v6-monitor");

const inactive = monitor.build({ enabled: false, stage: "off", rolloutPercent: 0 }, {});
assert.equal(inactive.status, "inactive");
assert.equal(inactive.stopRequested, false);

const collecting = monitor.build(
  { enabled: true, stage: "canary", rolloutPercent: 10 },
  { overall: { comparableCount: 10, aWins: 2, bWins: 3 } }
);
assert.equal(collecting.status, "collecting-canary-evidence");

const healthy = monitor.build(
  { enabled: true, stage: "canary", rolloutPercent: 10 },
  { overall: { comparableCount: 30, aWins: 8, bWins: 12, bWinRate: 40 }, byVenue: [] }
);
assert.equal(healthy.status, "healthy");
assert.equal(healthy.stopRequested, false);

const losing = monitor.build(
  { enabled: true, stage: "canary", rolloutPercent: 10 },
  { overall: { comparableCount: 30, aWins: 13, bWins: 7, bWinRate: 23.3 }, byVenue: [] }
);
assert.equal(losing.status, "stop-requested");
assert.equal(losing.rollbackRecommended, true);

const venueRegression = monitor.build(
  { enabled: true, stage: "canary", rolloutPercent: 10 },
  { overall: { comparableCount: 30, aWins: 8, bWins: 12, bWinRate: 40 }, byVenue: [{ comparableCount: 10, aWins: 7, bWins: 2 }] }
);
assert.equal(venueRegression.status, "stop-requested");
assert.equal(venueRegression.metrics.harmfulVenueCount, 1);
assert.equal(venueRegression.automaticStopApplication, false);
assert.equal(venueRegression.usableForPrediction, false);

console.log("展開AI v6監視テスト：成功");
