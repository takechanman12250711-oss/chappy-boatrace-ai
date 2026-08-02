"use strict";

const assert = require("node:assert/strict");
const { build } = require("../js/theory-stop-decision-report");

const inactive = build({}, {}, {});
assert.equal(inactive.status, "no-action");
assert.equal(inactive.recommendedAction, "keep-off");

const approved = build({ adoptionAllowed: true }, { enabled: false }, {});
assert.equal(approved.status, "approved-not-running");

const healthy = build(
  { adoptionAllowed: true },
  { enabled: true, rolloutPercent: 10 },
  { status: "healthy", stopRequested: false }
);
assert.equal(healthy.status, "monitoring-canary");
assert.equal(healthy.rolloutPercent, 10);

const stopped = build(
  { adoptionAllowed: true },
  { enabled: true, rolloutPercent: 25 },
  { status: "stop-requested", stopRequested: true, rollbackRecommended: true, reasons: ["B優勢幅が0未満"] }
);
assert.equal(stopped.status, "operator-action-required");
assert.equal(stopped.recommendedAction, "stop-and-rollback");
assert.equal(stopped.requiredSteps.length, 4);
assert.equal(stopped.automaticApplication, false);
assert.equal(stopped.currentSafeguards.automaticStopApplication, false);

console.log("theory stop decision report tests passed");
