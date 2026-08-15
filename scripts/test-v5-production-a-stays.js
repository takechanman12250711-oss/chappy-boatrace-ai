"use strict";
const assert = require("node:assert/strict");
const decision = require("../config/scenario-likelihood-v5-decision.json");
const systems = require("../config/upgrade-collection-systems.json");
assert.equal(decision.decision, "keep-production-a");
assert.equal(decision.productionCandidate, false);
assert.equal(systems.systems.scenarioLikelihoodV5Ab, "collect");
assert.equal(systems.productionApplication, "separate-decision-required");
console.log("production A stays while v5 upgrade data continues collecting");
