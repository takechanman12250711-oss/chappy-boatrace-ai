"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const text = fs.readFileSync(path.join(__dirname, "..", "docs", "upgrade-collection-final.md"), "utf8");
assert.match(text, /改善用システムは止めない/);
assert.match(text, /データを取り続け/);
assert.match(text, /採用できる改善だけを本番へ別実装/);
console.log("final upgrade collection documentation tests passed");
