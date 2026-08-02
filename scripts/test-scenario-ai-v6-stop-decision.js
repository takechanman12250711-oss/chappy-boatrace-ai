"use strict";

const assert = require("node:assert/strict");
const { build } = require("../js/scenario-ai-v6-stop-decision");

const approved = { status: "approved", adoptionAllowed: true };
const running = { status: "canary-running", enabled: true, rolloutPercent: 10 };

const idle = build({}, { status: "off", rolloutPercent: 0 }, { status: "inactive" });
assert.equal(idle.status, "not-running");
assert.equal(idle.requiresOperatorAction, false);

const monitoring = build(approved, running, { status: "healthy", metrics: { comparableCount: 30, aWins: 8, bWins: 12 } });
assert.equal(monitoring.status, "monitoring-canary");
assert.equal(monitoring.requiresOperatorAction, false);

const alert = build(approved, running, { status: "stop-requested", stopRequested: true, rollbackRecommended: true, metrics: { comparableCount: 25, aWins: 13, bWins: 6, harmfulVenueCount: 1 } });
assert.equal(alert.status, "operator-action-required");
assert.equal(alert.requiresOperatorAction, true);
assert.equal(alert.actions.length, 4);
assert.equal(alert.automaticStopApplication, false);
assert.equal(alert.usableForPrediction, false);

const stopped = build(approved, { status: "stopped", emergencyStop: true, rolloutPercent: 0 }, { status: "stop-requested", stopRequested: true });
assert.equal(stopped.status, "stopped-or-rolled-back");
assert.equal(stopped.requiresOperatorAction, false);

console.log("scenario AI v6 stop decision tests passed");
