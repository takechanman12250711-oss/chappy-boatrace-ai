"use strict";
const assert = require("node:assert/strict");
const systems = require("../config/upgrade-collection-systems.json");
const active = require("../config/upgrade-collection-active.json");
assert.equal(active.active, true);
assert.equal(active.stopOnCandidateRejection, false);
for (const key of Object.keys(systems.systems)) assert.equal(systems.systems[key], "collect");
console.log("all upgrade collectors restored and active");
