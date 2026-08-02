"use strict";
const assert = require("node:assert/strict");
const rollout = require("../js/theory-adoption-rollout");

const denied = rollout.build({ adoptionAllowed: false }, { enabled: true, rolloutPercent: 25 });
assert.equal(denied.enabled, false);
assert.equal(denied.status, "awaiting-approval");

const approvedOff = rollout.build({ adoptionAllowed: true }, { enabled: false, rolloutPercent: 25 });
assert.equal(approvedOff.enabled, false);
assert.equal(approvedOff.status, "approved-not-enabled");

const canary = rollout.build({ adoptionAllowed: true, candidateFingerprint: "abc" }, { enabled: true, rolloutPercent: 10 });
assert.equal(canary.enabled, true);
assert.equal(canary.rolloutPercent, 10);
assert.equal(canary.stage, "canary");
assert.equal(canary.automaticApplication, false);
assert.equal(canary.usableForPrediction, false);

const capped = rollout.build({ adoptionAllowed: true }, { enabled: true, rolloutPercent: 80, maximumRolloutPercent: 25 });
assert.equal(capped.rolloutPercent, 25);

const stopped = rollout.build({ adoptionAllowed: true }, { enabled: true, rolloutPercent: 10, emergencyStop: true });
assert.equal(stopped.enabled, false);
assert.equal(stopped.status, "stopped");
assert.equal(stopped.rolloutPercent, 0);

const rolledBack = rollout.build({ adoptionAllowed: true }, { enabled: true, rolloutPercent: 10, rollbackRequested: true });
assert.equal(rolledBack.enabled, false);
assert.equal(rolledBack.status, "stopped");

console.log("theory adoption rollout tests passed");
