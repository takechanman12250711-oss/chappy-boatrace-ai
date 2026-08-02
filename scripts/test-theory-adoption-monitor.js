"use strict";

const assert = require("node:assert/strict");
const monitor = require("../js/theory-adoption-monitor");

const inactive = monitor.build({ enabled: false }, { overall: { comparableCount: 100, bWins: 60, aWins: 20 } });
assert.equal(inactive.status, "inactive");
assert.equal(inactive.stopRequested, false);

const collecting = monitor.build({ enabled: true, stage: "canary", rolloutPercent: 10 }, { overall: { comparableCount: 10, bWins: 6, aWins: 2 } });
assert.equal(collecting.status, "collecting-canary-evidence");

const healthy = monitor.build({ enabled: true, stage: "canary", rolloutPercent: 10 }, { overall: { comparableCount: 30, bWins: 18, aWins: 6, bWinRate: 60, aWinRate: 20 }, byVenueTheory: [] });
assert.equal(healthy.status, "healthy");
assert.equal(healthy.stopRequested, false);

const losing = monitor.build({ enabled: true, stage: "canary", rolloutPercent: 10 }, { overall: { comparableCount: 30, bWins: 8, aWins: 14, bWinRate: 26.7, aWinRate: 46.7 }, byVenueTheory: [] });
assert.equal(losing.status, "stop-requested");
assert.equal(losing.rollbackRecommended, true);
assert.equal(losing.automaticStopApplication, false);
assert.equal(losing.usableForPrediction, false);

console.log("theory adoption monitor tests passed");
