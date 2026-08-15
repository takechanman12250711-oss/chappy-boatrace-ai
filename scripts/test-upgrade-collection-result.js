"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const text = fs.readFileSync(path.join(__dirname, "..", "docs", "upgrade-collection-result.md"), "utf8");
assert.match(text, /本番不採用の履歴として保持/);
assert.match(text, /データ収集は再び継続状態/);
assert.match(text, /本番反映は別の採用判断/);
console.log("upgrade collection result tests passed");
