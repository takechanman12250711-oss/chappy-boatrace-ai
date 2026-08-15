"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const text = fs.readFileSync(path.join(__dirname, "..", "docs", "upgrade-collection-one-line.txt"), "utf8");
assert.match(text, /データ収集を継続/);
assert.match(text, /候補の採否と本番実装は別/);
console.log("concise upgrade collection rule tests passed");
