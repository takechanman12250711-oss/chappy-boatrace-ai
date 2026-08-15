"use strict";
const assert = require("node:assert/strict");
const c = require("../config/upgrade-collection-active.json");
assert.equal(c.active, true);
assert.equal(c.mode, "parallel");
assert.equal(c.purpose, "future-version-accuracy-improvement");
assert.equal(c.stopOnCandidateRejection, false);
assert.equal(c.automaticApplication, false);
console.log("upgrade collection active tests passed");
