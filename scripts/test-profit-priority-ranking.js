"use strict";
const assert = require("node:assert/strict");
const engine = require("../js/profit-priority-ranking");

const report = { byTheory: [
  { theoryKey: "flow", label: "展開", raceCount: 40, useCount: 40, recoveryRate: 55, practicalHitRate: 18, skipDecisionAccuracy: 72, hitRate: 16 },
  { theoryKey: "start", label: "ST", raceCount: 40, useCount: 40, recoveryRate: 80, practicalHitRate: 10, skipDecisionAccuracy: 60, hitRate: 12 },
  { theoryKey: "wall", label: "壁艇", raceCount: 20, useCount: 20, recoveryRate: 20, hitRate: 5 }
]};
const result = engine.build(report);
assert.equal(result.status, "candidate-selected");
assert.equal(result.selectedTheory.theoryKey, "flow");
assert.equal(result.ranking.filter(row => row.selectedForImprovement).length, 1);
assert.equal(result.ranking.find(row => row.theoryKey === "wall").eligible, false);
assert.equal(result.humanApprovalRequired, true);
assert.equal(result.automaticApplication, false);
assert.equal(result.usableForPrediction, false);
assert.equal(result.uiVisible, false);
assert.equal(engine.build({}).status, "collecting-data");
console.log("Profit priority ranking: 合格");
