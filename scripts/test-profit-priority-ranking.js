"use strict";

const assert = require("node:assert/strict");
const engine = require("../js/profit-priority-ranking");

assert.equal(engine.numberOrNull(null), null);
assert.equal(engine.numberOrNull(undefined), null);
assert.equal(engine.numberOrNull(""), null);
assert.equal(engine.numberOrNull("0"), 0);

const report = { byTheory: [
  { theoryKey: "flow", label: "展開", raceCount: 100, useCount: 40, evaluatedCount: 40, recoveryRate: 55, practicalHitRate: 18, skipDecisionAccuracy: 72, hitRate: 16 },
  { theoryKey: "start", label: "ST", raceCount: 100, useCount: 40, evaluatedCount: 40, recoveryRate: 80, practicalHitRate: 10, skipDecisionAccuracy: 60, hitRate: 12 },
  { theoryKey: "wall", label: "壁艇", raceCount: 100, useCount: 20, evaluatedCount: 20, recoveryRate: 20, hitRate: 5 },
  { theoryKey: "course", label: "コース", raceCount: 100, useCount: 35, evaluatedCount: 35, recoveryRate: 90, practicalHitRate: null, skipDecisionAccuracy: null, hitRate: 14 }
]};

const result = engine.build(report);
assert.equal(result.status, "candidate-selected");
assert.equal(result.selectedTheory.theoryKey, "flow");
assert.equal(result.ranking.filter(row => row.selectedForImprovement).length, 1);
assert.equal(result.ranking.find(row => row.theoryKey === "wall").eligible, false);
const course = result.ranking.find(row => row.theoryKey === "course");
assert.deepEqual(course.missingMetrics, ["practicalHitRate", "skipDecisionAccuracy"]);
assert.equal(course.metrics.practicalHitRate, null);
assert.equal(course.metrics.skipDecisionAccuracy, null);
assert.equal(result.humanApprovalRequired, true);
assert.equal(result.automaticApplication, false);
assert.equal(result.usableForPrediction, false);
assert.equal(result.uiVisible, false);
assert.equal(engine.build({}).status, "collecting-data");

console.log("Profit priority ranking: 合格");
