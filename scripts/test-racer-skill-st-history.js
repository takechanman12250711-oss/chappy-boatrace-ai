"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// 公式履歴の空ファイル再発をmainへ入れる前に止める。
const file = path.join(
  process.cwd(),
  "data",
  "stats",
  "racer-skill-patterns.json"
);

const raw = fs.readFileSync(file, "utf8").trim();
assert.ok(raw.length > 2, "racer-skill-patterns.json が空です");

const data = JSON.parse(raw);
const racers = Object.values(data?.racers || {});
assert.ok(racers.length > 0, "選手別ST履歴が0件です");

let courseRows = 0;
let stRows = 0;
for (const racer of racers) {
  for (const windowName of ["all3Years", "recent1Year", "previous2Years"]) {
    for (const row of Object.values(racer?.windows?.[windowName]?.byCourse || {})) {
      if (Number(row?.starts || 0) > 0) courseRows += 1;
      if (
        Number(row?.starts || 0) > 0 &&
        Number.isFinite(Number(row?.averageSt))
      ) {
        stRows += 1;
      }
    }
  }
}

assert.ok(courseRows > 0, "実進入コース別履歴が0件です");
assert.ok(stRows > 0, "実進入コース別平均STが0件です");

console.log(`選手別ST履歴: ${racers.length}選手 / コース履歴${courseRows}件 / ST履歴${stRows}件`);
console.log("racer-skill ST history guard: ok");
