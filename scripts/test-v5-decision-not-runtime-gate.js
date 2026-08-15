"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "..", "js", "scenario-likelihood-v5-ab.js"), "utf8");
assert.doesNotMatch(source, /abDecision/);
console.log("historical v5 decision is not a runtime collection gate");
