"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const text = fs.readFileSync(path.join(__dirname, "..", "docs", "decisions", "scenario-likelihood-v5-20260815.md"), "utf8");
assert.match(text, /候補世代は本番不採用/);
assert.match(text, /データ収集システムは継続/);
console.log("v5 decision documentation tests passed");
