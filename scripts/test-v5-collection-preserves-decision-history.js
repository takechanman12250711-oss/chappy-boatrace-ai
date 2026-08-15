"use strict";
const assert = require("node:assert/strict");
const history = require("../config/scenario-likelihood-v5-decision-history.json");
const systems = require("../config/upgrade-collection-systems.json");
assert.equal(history.decisions[0].status, "rejected");
assert.equal(history.collectionSystemStatus, "active");
assert.equal(systems.systems.scenarioLikelihoodV5Ab, "collect");
console.log("v5 collection continues while rejected decision history is preserved");
