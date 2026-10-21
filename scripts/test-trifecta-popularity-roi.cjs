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
    race(3, 7000, { finishers: [{ rank: 1, boat: 1 }, { rank: 1, boat: 4 }, { rank: 3, boat: 2 }] }),
    race(1, 400, { finishers: [{ rank: 1, boat: 1 }, { rank: 2, boat: 2 }, { rank: 3, boat: 3 }, { rank: 4, boat: 4 }, { rank: 4, boat: 5 }] }),
    { status: "void", void: true, trifecta: null },
    { status: "finished", void: false, trifecta: { boats: [1, 2, 3], popularity: null, payout: 700 } }
  ]
}));
const out = path.join(dir, "report.json");
const report = build({ from: "20240101", results, out });
const band = (key) => report.all.find((row) => row.band === key);

assert.strictEqual(report.racesCounted, 5, "開始日前・不成立・人気なし・3着以内の同着を除く（4着の同着は数える）");
assert.strictEqual(report.finishedRacesWithoutPopularity, 1);
assert.strictEqual(report.topThreeDeadHeatsExcluded, 1);
assert.strictEqual(band("1-1").hitRaces, 2);
assert.strictEqual(band("1-1").roiPct, 180, "(500+400) / (5R×1点×100)");
assert.strictEqual(band("2-3").roiPct, 90, "900 / (5R×2点×100)、同着の7000は含めない");
assert.strictEqual(band("4-10").roiPct, 57.1, "2000 / (5R×7点×100)");
assert.strictEqual(band("61-120").roiPct, 100, "30000 / (5R×60点×100)");
assert.strictEqual(band("1-1").hitRatePct, 40);
assert.strictEqual(report.all.reduce((sum, row) => sum + row.hitRaces, 0), 5, "各レースはちょうど1帯で的中");
assert.strictEqual(report.usableForPrediction, false);
assert.ok(fs.existsSync(out));
fs.rmSync(dir, { recursive: true, force: true });
console.log("trifecta-popularity-roi: all checks passed");
