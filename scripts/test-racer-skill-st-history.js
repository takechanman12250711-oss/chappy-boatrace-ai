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
let positionRows = 0;
for (const racer of racers) {
  for (const windowName of ["all3Years", "recent1Year", "previous2Years"]) {
    for (const row of Object.values(racer?.windows?.[windowName]?.byCourse || {})) {
      const starts = Number(row?.starts || 0);
      if (starts > 0) {
        courseRows += 1;
        const wins = Number(row?.wins);
        const seconds = Number(row?.seconds);
        const thirds = Number(row?.thirds);
        const top3 = Number(row?.top3);
        assert.ok(Number.isInteger(seconds) && seconds >= 0, "2着数が未保存です");
        assert.ok(Number.isInteger(thirds) && thirds >= 0, "3着数が未保存です");
        assert.equal(top3, wins + seconds + thirds, "3連対数の内訳が不整合です");
        assert.ok(top3 <= starts, "3連対数が出走数を超えています");
        positionRows += 1;
      }
      if (starts > 0 && Number.isFinite(Number(row?.averageSt))) {
        stRows += 1;
      }
    }
  }
}

assert.ok(courseRows > 0, "実進入コース別履歴が0件です");
assert.ok(stRows > 0, "実進入コース別平均STが0件です");
assert.equal(positionRows, courseRows, "着順内訳を検証できないコース履歴があります");

console.log(
  `選手別ST履歴: ${racers.length}選手 / コース履歴${courseRows}件 / ` +
    `ST履歴${stRows}件 / 2着・3着内訳${positionRows}件`
);
console.log("racer-skill ST history guard: ok");
