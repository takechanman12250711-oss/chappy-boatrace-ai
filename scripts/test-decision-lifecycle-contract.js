"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const text = fs.readFileSync(path.join(__dirname, "..", "docs", "decisions", "README.md"), "utf8");
assert.match(text, /候補の不採用.*収集システムの停止は別物/);
assert.match(text, /収集は継続/);
console.log("candidate decision lifecycle contract tests passed");
