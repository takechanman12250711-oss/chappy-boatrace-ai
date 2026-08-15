"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "collect-predictions.js"), "utf8");
assert.match(source, /scenarioLikelihoodV5Ab\.build/);
assert.match(source, /scenarioLikelihoodV5Ab:\s*scenarioLikelihoodAb/);
console.log("collector still stores scenario likelihood v5 A/B upgrade evidence");
