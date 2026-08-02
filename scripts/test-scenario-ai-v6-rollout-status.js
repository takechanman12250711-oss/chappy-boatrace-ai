"use strict";

const assert = require("node:assert");
const { buildStatus, MAX_PERCENT } = require("./build-scenario-ai-v6-rollout-status");

const approved = { status: "approved", adoptionAllowed: true };
const denied = { status: "awaiting-human-approval", adoptionAllowed: false };

let row = buildStatus(denied, { enabled: true, requestedRolloutPercent: 10 });
assert.equal(row.status, "approval-required");
assert.equal(row.rolloutPercent, 0);

row = buildStatus(approved, { enabled: false, requestedRolloutPercent: 10 });
assert.equal(row.status, "approved-not-running");
assert.equal(row.rolloutPercent, 0);

row = buildStatus(approved, { enabled: true, requestedRolloutPercent: 10 });
assert.equal(row.status, "canary-running");
assert.equal(row.rolloutPercent, 10);

row = buildStatus(approved, { enabled: true, requestedRolloutPercent: 80 });
assert.equal(row.rolloutPercent, MAX_PERCENT);
assert.equal(row.rolloutLimited, true);

row = buildStatus(approved, { enabled: true, requestedRolloutPercent: 20, emergencyStop: true });
assert.equal(row.status, "stopped");
assert.equal(row.rolloutPercent, 0);

row = buildStatus(approved, { enabled: true, requestedRolloutPercent: 20, rollbackRequested: true });
assert.equal(row.status, "stopped");
assert.equal(row.rolloutPercent, 0);
assert.equal(row.automaticExpansion, false);
assert.equal(row.usableForPrediction, false);
assert.equal(row.automaticApplication, false);

console.log("scenario AI v6 rollout status tests passed");
