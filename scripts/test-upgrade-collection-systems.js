"use strict";
const assert = require("node:assert/strict");
const config = require("../config/upgrade-collection-systems.json");
assert.equal(config.status, "active");
for (const [name, state] of Object.entries(config.systems || {})) {
  assert.equal(state, "collect", `${name} must keep collecting`);
}
assert.equal(config.productionApplication, "separate-decision-required");
assert.equal(config.automaticApplication, false);
console.log("all version-up collection systems remain active");
