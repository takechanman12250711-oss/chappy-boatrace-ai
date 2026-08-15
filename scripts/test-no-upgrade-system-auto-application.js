"use strict";
const assert = require("node:assert/strict");
const systems = require("../config/upgrade-collection-systems.json");
const policy = require("../config/upgrade-collection-policy.json");
assert.equal(systems.automaticApplication, false);
assert.equal(policy.rules.automaticApplication, false);
assert.equal(systems.productionApplication, "separate-decision-required");
console.log("upgrade collection remains shadow/data-only until separate adoption");
