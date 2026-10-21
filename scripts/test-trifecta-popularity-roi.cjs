#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { build } = require("./build-trifecta-popularity-roi.cjs");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "popularity-roi-"));
const results = path.join(dir, "results");
fs.mkdirSync(results);
const race = (popularity, payout, extra = {}) => ({
  status: "finished", void: false, trifecta: { boats: [1, 2, 3], popularity, payout }, ...extra
});
fs.writeFileSync(path.join(results, "20231231.json"), JSON.stringify({ races: [race(1, 99999)] }));
fs.writeFileSync(path.join(results, "20240101.json"), JSON.stringify({
  races: [
    race(1, 500),
    race(2, 900),
    race(5, 2000),
    race(80, 30000),
    { status: "void", void: true, trifecta: null },
    { status: "finished", void: false, trifecta: { boats: [1, 2, 3], popularity: null, payout: 700 } }
  ]
}));
const out = path.join(dir, "report.json");
const report = build({ from: "20240101", results, out });
const band = (key) => report.all.find((row) => row.band === key);

assert.strictEqual(report.racesCounted, 4, "開始日前・不成立・人気なしを除く");
assert.strictEqual(report.finishedRacesWithoutPopularity, 1);
assert.strictEqual(band("1-1").hitRaces, 1);
assert.strictEqual(band("1-1").roiPct, 125, "500 / (4R×1点×100)");
assert.strictEqual(band("2-3").roiPct, 112.5, "900 / (4R×2点×100)");
assert.strictEqual(band("4-10").roiPct, 71.4, "2000 / (4R×7点×100)");
assert.strictEqual(band("61-120").roiPct, 125, "30000 / (4R×60点×100)");
assert.strictEqual(band("1-1").hitRatePct, 25);
assert.strictEqual(report.all.reduce((sum, row) => sum + row.hitRaces, 0), 4, "各レースはちょうど1帯で的中");
assert.strictEqual(report.usableForPrediction, false);
assert.ok(fs.existsSync(out));
fs.rmSync(dir, { recursive: true, force: true });
console.log("trifecta-popularity-roi: all checks passed");
