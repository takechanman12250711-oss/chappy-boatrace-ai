"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const text = fs.readFileSync(path.join(__dirname, "..", "docs", "upgrade-collection-policy.md"), "utf8");
assert.match(text, /収集基盤.*継続運転/);
assert.match(text, /バージョンアップ用データ収集システム自体は止めない/);
assert.match(text, /自動本番適用は禁止/);
console.log("upgrade collection policy documentation tests passed");
