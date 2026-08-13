"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const reportBuilder = require(
  "./build-practical-priority-shadow-report"
);

const committed = JSON.parse(
  fs.readFileSync(reportBuilder.OUTPUT, "utf8")
);
const rebuilt = reportBuilder.buildReport(
  committed.generatedAt
);

assert.deepEqual(
  committed,
  rebuilt,
  "保存済み順位候補シャドーレポートは現在の正本入力と一致する"
);
assert.equal(
  reportBuilder.reportForWrite(
    "2099-01-01T00:00:00.000Z"
  ).generatedAt,
  committed.generatedAt,
  "集計内容が同じなら生成時刻だけを更新しない"
);

console.log(
  "practical priority prospective shadow artifact: OK"
);
