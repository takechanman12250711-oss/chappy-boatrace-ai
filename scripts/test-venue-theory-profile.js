"use strict";

const assert = require("node:assert/strict");
const profile = require("../js/venue-theory-profile");

const report = {
  generatedAt: "2026-09-20T00:00:00.000Z",
  analysisInputContract: "official-pre-deadline-cohort-v1",
  byVenueTheory: [
    { jcd: "02", place: "戸田", theoryKey: "course", label: "コース理論", evaluatedCount: 80, practicalHitRate: 31, recoveryRate: 282.8, profit: 120000 },
    { jcd: "02", place: "戸田", theoryKey: "wall-boat", label: "壁艇理論", evaluatedCount: 70, practicalHitRate: 25, recoveryRate: 76, profit: -12000 },
    { jcd: "02", place: "戸田", theoryKey: "motor", label: "モーター理論", evaluatedCount: 19, practicalHitRate: 40, recoveryRate: 200, profit: 5000 },
    { jcd: "16", place: "児島", theoryKey: "course", label: "コース理論", evaluatedCount: 60, practicalHitRate: 9, recoveryRate: 18.3, profit: -80000 }
  ],
  byVenueScenarioTheory: [
    { jcd: "02", place: "戸田", scenarioKey: "escape", scenarioLabel: "1逃げ", theoryKey: "course", label: "コース理論", evaluatedCount: 40, practicalHitRate: 30, recoveryRate: 160, profit: 24000 },
    { jcd: "02", place: "戸田", scenarioKey: "four-attack", scenarioLabel: "4カド攻め", theoryKey: "wall-boat", label: "壁艇理論", evaluatedCount: 24, practicalHitRate: 8, recoveryRate: 22, profit: -39000 },
    { jcd: "02", place: "戸田", scenarioKey: "sashi", scenarioLabel: "2差し", theoryKey: "course", label: "コース理論", evaluatedCount: 8, practicalHitRate: 50, recoveryRate: 300, profit: 10000 }
  ]
};

const built = profile.build(report);
assert.equal(built.venueCount, 24);
assert.equal(built.productionChanged, false);
assert.equal(built.automaticProductionChange, false);
assert.equal(built.usableForPrediction, false);
assert.equal(built.scenarioCoverage, "AVAILABLE");
assert.equal(built.venues[0].jcd, "01");
assert.equal(built.venues[23].jcd, "24");

const toda = built.venues.find(row => row.jcd === "02");
assert.equal(toda.strongTheories[0].theoryKey, "course");
assert.equal(toda.weakTheories[0].theoryKey, "wall-boat");
assert.equal(toda.insufficientTheories[0].theoryKey, "motor");
assert.equal(toda.profitDrivers[0].scenarioKey, "escape");
assert.equal(toda.lossDrivers[0].scenarioKey, "four-attack");
assert.equal(toda.profitDrivers.some(row => row.scenarioKey === "sashi"), false);

const kojima = built.venues.find(row => row.jcd === "16");
assert.equal(kojima.weakestTheory.recoveryRate, 18.3);
assert.equal(profile.classify({ evaluatedCount: 20, recoveryRate: 80 }), "WATCH");
assert.equal(profile.classify({ evaluatedCount: 20, recoveryRate: 100 }), "STRONG");
assert.equal(profile.classify({ evaluatedCount: 19, recoveryRate: 500 }), "INSUFFICIENT_EVIDENCE");
assert.equal(profile.compact({ evaluatedCount: 0, recoveryRate: null }).recoveryRate, null);

console.log("venue theory profile tests passed");
