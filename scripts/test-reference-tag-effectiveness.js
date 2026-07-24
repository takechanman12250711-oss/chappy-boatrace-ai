#!/usr/bin/env node
"use strict";

const assert = require("assert");
const { analyze, actualTicket, extractTags, predictedTickets } = require("./analyze-reference-tag-effectiveness");

const records = [
  {
    date: "20260724",
    place: "大村",
    raceNo: 7,
    referenceTags: [
      { key: "exhibition", label: "⚪1号艇 展示タイム上位", strength: 3 },
      { key: "wind", label: "向かい風5m注意", strength: 2 }
    ],
    practicalSelection: ["1-2-3", "1-3-2"],
    result: { trifecta: "1-2-3" }
  },
  {
    date: "20260724",
    place: "多摩川",
    raceNo: 8,
    tags: [
      { key: "lap", label: "🔵4号艇 一周タイム上位", strength: 2 },
      { key: "exhibition", label: "⚫2号艇 展示タイム上位", strength: 1 }
    ],
    tickets: [{ ticket: "4-1-2" }],
    officialResult: { order: [4, 1, 2] }
  }
];

assert.strictEqual(actualTicket(records[0]), "1-2-3");
assert.strictEqual(actualTicket(records[1]), "4-1-2");
assert.strictEqual(extractTags(records[0]).length, 2);
assert.deepStrictEqual(predictedTickets(records[1]), ["4-1-2"]);

const report = analyze(records);
assert.strictEqual(report.matchedRaceCount, 2);
assert.strictEqual(report.tagCount, 3);

const exhibition = report.tags.find(tag => tag.key === "exhibition");
assert(exhibition);
assert.strictEqual(exhibition.samples, 2);
assert.strictEqual(exhibition.winnerHits, 1);
assert.strictEqual(exhibition.top3Hits, 2);
assert.strictEqual(exhibition.ticketHits, 2);
assert.strictEqual(exhibition.winnerRate, 50);
assert.strictEqual(exhibition.top3Rate, 100);
assert.strictEqual(exhibition.status, "データ不足");

const lap = report.tags.find(tag => tag.key === "lap");
assert(lap);
assert.strictEqual(lap.winnerHits, 1);
assert.strictEqual(lap.top3Hits, 1);

console.log("reference tag effectiveness tests passed");
