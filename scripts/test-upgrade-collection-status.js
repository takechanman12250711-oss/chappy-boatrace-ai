"use strict";
const assert = require("node:assert/strict");
const s = require("../config/upgrade-collection-status.json");
assert.equal(s.status, "running");
assert.equal(s.production, "unchanged");
assert.equal(s.candidateHistory, "retained");
assert.equal(s.futureEvidence, "collecting");
assert.equal(s.automaticApplication, false);
console.log("upgrade collection status tests passed");
