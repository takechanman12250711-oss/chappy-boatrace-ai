"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const text = fs.readFileSync(path.join(__dirname, "..", "docs", "upgrade-collection-summary.md"), "utf8");
assert.match(text, /並行してデータを取り続ける/);
assert.match(text, /不採用でも.*継続/);
assert.match(text, /本番反映と改善データ収集は別ライフサイクル/);
console.log("upgrade collection summary tests passed");
