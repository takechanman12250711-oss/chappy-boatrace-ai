"use strict";
const assert = require("assert");
const engine = require("../js/theory-improvement-proposals");

const performance = {
  byTheory: [
    { key: "wall", theoryKey: "wall", label: "壁艇理論", raceCount: 80, hitRate: 36, scenarioMatchRate: 62, recoveryRate: 118 },
    { key: "new-engine", theoryKey: "new-engine", label: "新エンジン理論", raceCount: 70, hitRate: 20, scenarioMatchRate: 40, recoveryRate: 72 },
    { key: "hold", theoryKey: "hold", label: "残し理論", raceCount: 65, hitRate: 31, scenarioMatchRate: 51, recoveryRate: 96 },
    { key: "small", theoryKey: "small", label: "少数理論", raceCount: 12, hitRate: 50, scenarioMatchRate: 70, recoveryRate: 150 }
  ],
  byVenueTheory: [
    { key: "20:hold", theoryKey: "hold", label: "残し理論", jcd: "20", place: "若松", raceCount: 35, hitRate: 42, scenarioMatchRate: 66, recoveryRate: 140 },
    { key: "12:wall", theoryKey: "wall", label: "壁艇理論", jcd: "12", place: "住之江", raceCount: 10, hitRate: 40, scenarioMatchRate: 60, recoveryRate: 120 }
  ]
};

const result = engine.build(performance);
assert.strictEqual(result.status, "proposals-ready");
assert.strictEqual(result.proposalOnly, true);
assert.strictEqual(result.usableForPrediction, false);
assert.strictEqual(result.automaticApplication, false);

const wall = result.byTheory.find(row => row.theoryKey === "wall");
assert.strictEqual(wall.action, "raise");
assert.strictEqual(wall.suggestedAdjustmentPoints, 2);

const engineTheory = result.byTheory.find(row => row.theoryKey === "new-engine");
assert.strictEqual(engineTheory.action, "lower");
assert.strictEqual(engineTheory.suggestedAdjustmentPoints, -2);

const hold = result.byTheory.find(row => row.theoryKey === "hold");
assert.strictEqual(hold.action, "maintain");

const small = result.byTheory.find(row => row.theoryKey === "small");
assert.strictEqual(small.action, "collect");
assert.strictEqual(small.status, "insufficient-samples");

const wakamatsu = result.byVenueTheory.find(row => row.key === "20:hold");
assert.strictEqual(wakamatsu.action, "raise");
assert.strictEqual(wakamatsu.place, "若松");

const suminoe = result.byVenueTheory.find(row => row.key === "12:wall");
assert.strictEqual(suminoe.action, "collect");
assert.strictEqual(result.proposalCount, 3);

console.log("theory improvement proposal tests passed");
