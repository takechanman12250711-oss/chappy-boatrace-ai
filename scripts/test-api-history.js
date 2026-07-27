"use strict";

const assert = require("node:assert/strict");
const {
  normalizeJcd,
  normalizeRegisterNo,
  buildHistoryContext
} = require("../api/_history");

assert.equal(normalizeJcd("1"), "01");
assert.equal(normalizeJcd("24"), "24");
assert.equal(normalizeJcd("25"), "");
assert.equal(normalizeRegisterNo(" 2014 "), "2014");
assert.equal(normalizeRegisterNo("20"), "");

const context = buildHistoryContext({
  jcd: "10",
  raceNo: 1,
  entries: [
    { registerNo: "2014" },
    { registerNo: "4001" }
  ]
});

assert.equal(context.ready, true);
assert.equal(context.source, "boatrace-official");
assert.equal(context.delivery, "api-race-compact-context");
assert.equal(context.venue?.jcd, "10");
assert.ok(context.venueRace?.trend);
assert.ok(context.courseStructure?.overall);
assert.ok(context.racers.length >= 1);
assert.ok(context.racers[0].skillHistory);
assert.ok(Number.isFinite(context.racers[0].localStarts));

console.log("API履歴コンテキストテスト: 合格");
