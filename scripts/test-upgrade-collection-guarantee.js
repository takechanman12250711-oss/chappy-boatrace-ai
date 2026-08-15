"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const text = fs.readFileSync(path.join(__dirname, "..", "docs", "upgrade-collection-guarantee.md"), "utf8");
assert.match(text, /データ収集を止めない/);
assert.match(text, /各改善系は並行して証拠を蓄積/);
assert.match(text, /本番へ入れる変更だけを別途採否・実装/);
console.log("upgrade collection guarantee tests passed");
