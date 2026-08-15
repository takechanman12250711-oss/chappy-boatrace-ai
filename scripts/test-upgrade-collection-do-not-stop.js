"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const text = fs.readFileSync(path.join(__dirname, "..", "docs", "upgrade-collection-do-not-stop.md"), "utf8");
assert.match(text, /データ収集システムを停止しない/);
assert.match(text, /収集・分析・証拠保存は.*継続/);
console.log("upgrade collection do-not-stop rule tests passed");
