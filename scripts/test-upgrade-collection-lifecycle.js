"use strict";
const assert = require("node:assert/strict");
const systems = require("../config/upgrade-collection-systems.json");
const scope = require("../config/candidate-decision-scope.json");
assert.equal(systems.status, "active");
assert.equal(scope.collectionSystemLifecycle, "independent");
assert.equal(scope.productionLifecycle, "independent");
assert.ok(Object.values(systems.systems).every(value => value === "collect"));
console.log("upgrade collection lifecycle remains independent and active");
