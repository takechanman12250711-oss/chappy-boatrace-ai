"use strict";
const assert = require("node:assert/strict");
const policy = require("../config/upgrade-collection-policy-version.json");
const systems = require("../config/upgrade-collection-systems.json");
assert.equal(policy.principle, "collect-continuously-adopt-separately");
assert.ok(Object.values(systems.systems).every(value => value === "collect"));
assert.equal(systems.automaticApplication, false);
console.log("main upgrade principle: collect continuously, adopt separately");
