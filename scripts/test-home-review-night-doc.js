"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const text = fs.readFileSync(
  path.join(__dirname, "..", "docs", "fixes", "home-review-night-20260816.md"),
  "utf8"
);

assert.match(text, /終了レース一覧を開く/);
assert.match(text, /大村はモーニングではなくナイター/);
assert.match(text, /UI構成・予想ロジック・買い目ロジックは変更しない/);

console.log("home review/night fix documentation contract passed");
