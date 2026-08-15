"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const text = fs.readFileSync(path.join(__dirname, "..", "docs", "upgrade-collection-recovery.md"), "utf8");
assert.match(text, /不採用履歴は保持/);
assert.match(text, /改善用収集システムは継続/);
assert.match(text, /候補採否.*収集システム稼働.*別ライフサイクル/);
console.log("upgrade collection recovery documentation tests passed");
