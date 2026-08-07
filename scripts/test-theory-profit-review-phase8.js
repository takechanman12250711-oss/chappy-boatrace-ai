"use strict";
const assert = require("node:assert/strict");
const phase8 = require("../js/theory-profit-review-phase8");

const performance = {
  byTheory: [
    { theoryKey: "race-flow", label: "展開理論", evaluatedCount: 29, recoveryRate: 108, practicalHitRate: 25, skipDecisionAccuracy: 72, hitRate: 18 },
    { theoryKey: "course", label: "コース理論", evaluatedCount: 30, recoveryRate: 92, practicalHitRate: 19, skipDecisionAccuracy: null, hitRate: 14 }
  ]
};
const ranking = { selectedTheory: { theoryKey: "course" } };
const result = phase8.build(performance, ranking);
assert.equal(result.status, "review-candidate-ready");
assert.equal(result.readyTheoryCount, 1);
assert.equal(result.candidate.theoryKey, "course");
assert.equal(result.candidate.evidenceCount, 30);
assert.deepEqual(result.candidate.missingMetrics, ["skipDecisionAccuracy"]);
assert.equal(result.candidate.metricStatuses.recoveryRate, "watch");
assert.equal(result.candidate.metricStatuses.practicalHitRate, "watch");
assert.equal(result.candidate.metricStatuses.skipDecisionAccuracy, "missing");
assert.equal(result.candidate.metricStatuses.hitRate, "watch");
assert.equal(result.automaticApplication, false);
assert.equal(result.usableForPrediction, false);
assert.equal(result.uiVisible, false);

const collecting = phase8.build({ byTheory: [{ theoryKey: "race-flow", evaluatedCount: 26, recoveryRate: 100 }] }, { selectedTheory: null });
assert.equal(collecting.status, "collecting-data");
assert.equal(collecting.candidate, null);
console.log("Phase8 theory profit review tests passed");
