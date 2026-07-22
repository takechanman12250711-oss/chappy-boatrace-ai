"use strict";

const assert = require("node:assert/strict");
const { buildReport } = require("../js/collection-health");

const report = buildReport({
  runs: [
    {
      checkedAt: "2026-07-22T01:00:00.000Z",
      collectionHealth: {
        targets: [
          { raceKey: "20260722-08-1", jcd: "08", place: "常滑", status: "fetch_failed" },
          { raceKey: "20260722-19-1", jcd: "19", place: "下関", status: "insufficient_data" }
        ]
      }
    },
    {
      checkedAt: "2026-07-22T01:15:00.000Z",
      collectionHealth: {
        targets: [
          { raceKey: "20260722-08-1", jcd: "08", place: "常滑", status: "saved" },
          { raceKey: "20260722-24-1", jcd: "24", place: "大村", status: "saved", recoveryState: "recovered" },
          { raceKey: "20260722-15-1", jcd: "15", place: "丸亀", status: "final_uncollected", recoveryState: "final_uncollected", missingReasons: ["STデータ3/6艇"] }
        ]
      }
    }
  ],
  predictions: [
    { raceKey: "20260722-08-1" },
    { raceKey: "20260722-24-1" }
  ],
  results: [{ raceKey: "20260722-08-1" }]
});

assert.equal(report.monitoredCount, 4);
assert.equal(report.savedCount, 2);
assert.equal(report.missingCount, 2);
assert.equal(report.insufficientDataCount, 1);
assert.equal(report.failedCount, 0);
assert.equal(report.coverageRate, 50);
assert.equal(report.recoveredCount, 1);
assert.equal(report.finalUncollectedCount, 1);
assert.equal(report.missingReasons[0].reason, "STデータ3/6艇");
assert.equal(report.settledCount, 1);
assert.equal(report.resultWaitingCount, 1);
assert.equal(report.venues.find(item => item.jcd === "19").missingCount, 1);
assert.equal(report.venues.find(item => item.jcd === "24").recoveredCount, 1);
assert.equal(report.venues.find(item => item.jcd === "15").finalUncollectedCount, 1);

console.log("自動収集監視テスト: 合格");
