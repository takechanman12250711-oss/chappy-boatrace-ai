"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const text = fs.readFileSync(path.join(__dirname, "..", "docs", "upgrade-collection-systems.md"), "utf8");
for (const label of ["展開AI v5 校正", "展開AI v5 A/B", "展開AI v6", "理論評価", "理論Shadow A/B", "順位候補Shadow", "枠別浮沈率Shadow"]) assert.match(text, new RegExp(label.replace("/", "\\/")));
assert.match(text, /不採用を理由に停止しない/);
console.log("upgrade collection systems documentation tests passed");
