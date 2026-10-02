"use strict";

const assert = require("node:assert/strict");
const engine = require("../js/theory-adoption-phase5");

const report = {
  byTheory: [
    { theoryKey: "race-flow", label: "展開理論", raceCount: 120, useCount: 120, hitRate: 18, recoveryRate: 112, scenarioMatchRate: 51, profit: 1200 },
    { theoryKey: "start", label: "ST・スリット理論", raceCount: 120, useCount: 120, hitRate: 8, recoveryRate: 72, scenarioMatchRate: 30, profit: -3000 },
    { theoryKey: "wall-boat", label: "壁艇理論", raceCount: 65, useCount: 65, hitRate: 20, recoveryRate: 130, scenarioMatchRate: 60, profit: 2000 }
  ],
  byVenueTheory: [
    { key: "20:race-flow", theoryKey: "race-flow", jcd: "20", place: "若松", raceCount: 25, hitRate: 20, recoveryRate: 118, scenarioMatchRate: 55 }
  ]
};

const result = engine.build(report, { status: "proposal-candidates-ready" });
assert.equal(result.status, "review-ready");
assert.equal(result.summary.candidate, 1);
assert.equal(result.summary.reject, 1);
assert.equal(result.summary.hold, 1);
assert.equal(result.theories.find(row => row.theoryKey === "race-flow").decision, "candidate");
assert.equal(result.theories.find(row => row.theoryKey === "start").decision, "reject");
assert.equal(result.theories.find(row => row.theoryKey === "wall-boat").decision, "hold");
assert.equal(result.humanApprovalRequired, true);
assert.equal(result.automaticApplication, false);
assert.equal(result.usableForPrediction, false);
assert.equal(result.uiVisible, false);
assert(result.theories.every(row => row.approved === false && row.usableForPrediction === false));
assert.equal(engine.build({}, {}).status, "collecting-data");

console.log("理論採用判定 Phase5: 合格");
