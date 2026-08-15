"use strict";
const assert = require("node:assert/strict");
const config = require("../config/upgrade-collection-mode.json");
assert.equal(config.mode, "continuous-parallel-collection");
assert.equal(config.production, "current-approved-only");
assert.equal(config.candidateDecisions, "per-generation");
assert.equal(config.collectors, "keep-running");
assert.equal(config.automaticApplication, false);
console.log("upgrade collection mode tests passed");
