"use strict";
const assert = require("node:assert/strict");
const config = require("../config/upgrade-collection-owner-intent.json");
assert.equal(config.keepCollecting, true);
assert.equal(config.implementValidatedImprovementsSeparately, true);
assert.equal(config.automaticApplication, false);
console.log("upgrade collection owner intent tests passed");
