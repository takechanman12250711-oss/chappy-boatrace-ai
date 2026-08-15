"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync(path.join(__dirname, "..", "js", "scenario-likelihood-v5-ab.js"), "utf8");
assert.doesNotMatch(source, /closed-rejected/);
assert.doesNotMatch(source, /applicationMode:\s*["']closed["']/);
assert.match(source, /status:\s*["']shadow-only["']/);
console.log("v5 collection is not closed by historical rejection");
