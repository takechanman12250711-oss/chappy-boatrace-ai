"use strict";
const fs = require("node:fs");
const path = require("node:path");
const file = path.join(__dirname, "test-load-performance.js");
let text = fs.readFileSync(file, "utf8");
const oldValue = `'"20260803-ui-fix2"'`;
const newValue = `'"20260806-results-ui-phase3-cache1"'`;
if (!text.includes(newValue)) {
  if (!text.includes(oldValue)) throw new Error("旧キャッシュ世代の期待値が見つかりません");
  text = text.replace(oldValue, newValue);
}
fs.writeFileSync(file, text);
console.log("results UI phase3 cache test updated");
