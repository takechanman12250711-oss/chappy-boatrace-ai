"use strict";

const assert = require("node:assert/strict");
const history = require("../config/scenario-likelihood-v5-decision-history.json");
assert.equal(history.collectionSystemStatus, "active");
assert.equal(history.automaticApplication, false);
assert.ok(Array.isArray(history.decisions));
assert.equal(history.decisions.length, 1);
assert.equal(history.decisions[0].status, "rejected");
assert.equal(history.decisions[0].decision, "keep-production-a");
assert.equal(history.decisions[0].productionCandidate, false);
console.log("v5 decision history tests passed");
