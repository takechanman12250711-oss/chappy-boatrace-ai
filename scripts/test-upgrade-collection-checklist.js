"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const text = fs.readFileSync(path.join(__dirname, "..", "docs", "upgrade-collection-checklist.md"), "utf8");
assert.match(text, /不採用でも改善収集システムを止めない/);
assert.match(text, /v5校正\/A-Bの新規データ収集を継続/);
assert.match(text, /v6・理論評価・理論Shadow・順位Shadow・枠別Shadowも収集継続/);
console.log("upgrade collection checklist tests passed");
