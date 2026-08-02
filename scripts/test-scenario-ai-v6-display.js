"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const display = fs.readFileSync("js/scenario-ai-v6-display.js", "utf8");
const loader = fs.readFileSync("js/prediction-runtime-loader.js", "utf8");

assert.match(display, /展開AI v6/);
assert.match(display, /◎ 本命展開/);
assert.match(display, /○ 対抗展開/);
assert.match(display, /▲ 穴展開/);
assert.match(display, /representativeTicket/);
assert.match(display, /表示専用/);
assert.match(loader, /js\/scenario-ai-v6-display\.js/);

for (const forbidden of ["affectsTickets: true", "automaticApplication: true", "usableForPrediction: true"]) {
  assert.equal(display.includes(forbidden), false);
}

console.log("展開AI v6画面表示テスト成功");
