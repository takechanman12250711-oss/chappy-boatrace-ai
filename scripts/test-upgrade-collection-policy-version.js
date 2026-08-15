"use strict";
const assert = require("node:assert/strict");
const policy = require("../config/upgrade-collection-policy-version.json");
assert.equal(policy.principle, "collect-continuously-adopt-separately");
assert.ok(policy.immutableRules.includes("candidate rejection does not stop collection systems"));
assert.ok(policy.immutableRules.includes("production adoption requires a separate decision"));
assert.ok(policy.immutableRules.includes("automatic production application remains disabled"));
console.log("upgrade collection policy version tests passed");
