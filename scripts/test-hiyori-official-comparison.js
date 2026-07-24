#!/usr/bin/env node
"use strict";

const assert = require("assert");
const { analyze, bestBoat, finishOrder, hasHiyori } = require("./analyze-hiyori-official-comparison.js");

const entries = [
  { boatNo: 1, exhibitionTime: 6.90, lapTime: 37.20, currentST: 0.16, localRate: 6.20 },
  { boatNo: 2, exhibitionTime: 6.82, lapTime: 37.05, currentST: 0.11, localRate: 7.10 },
  { boatNo: 3, exhibitionTime: 6.95, lapTime: 37.40, currentST: 0.19, localRate: 5.80 }
];

assert.deepStrictEqual(finishOrder({ result: { trifecta: "2-1-3" } }), [2, 1, 3]);
assert.strictEqual(hasHiyori({ externalData: { source: "ボートレース日和" } }), true);
assert.strictEqual(bestBoat(entries, ["exhibitionTime"], true).boat, 2);
assert.strictEqual(bestBoat(entries, ["localRate"], false).boat, 2);

const report = analyze([
  {
    externalData: { source: "hiyori" },
    entries,
    result: { order: [2, 1, 3] }
  },
  {
    externalData: { source: "official" },
    entries,
    result: { order: [2, 1, 3] }
  }
]);

assert.strictEqual(report.matchedRaceCount, 1);
for (const metric of report.metrics) {
  assert.strictEqual(metric.samples, 1);
  assert.strictEqual(metric.winnerHits, 1);
  assert.strictEqual(metric.top3Hits, 1);
  assert.strictEqual(metric.winnerRate, 100);
  assert.strictEqual(metric.top3Rate, 100);
  assert.strictEqual(metric.status, "データ不足");
}

console.log("hiyori official comparison tests passed");
