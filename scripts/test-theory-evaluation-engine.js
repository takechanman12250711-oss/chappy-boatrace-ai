"use strict";

const assert = require("node:assert/strict");
const engine = require("../js/theory-evaluation-engine");
const builder = require("./build-theory-evaluations");

const record = {
  raceKey: "20260806-20-01",
  result: { settled: true, resultTicket: "1-2-4" },
  theoryTagSnapshot: {
    theories: [
      { theoryKey: "race-flow-main", label: "展開理論", tickets: ["1-2-4", "1-3-2"] },
      { theoryKey: "wall-boat", label: "壁艇理論", tickets: ["1-2-4"] },
      { theoryKey: "double-time", label: "ダブルタイム", tickets: ["3-1-4"] }
    ]
  }
};

const result = engine.build(record);
assert.equal(result.catalogSize, 12);
assert.equal(result.uiVisible, false);
assert.equal(result.usableForPrediction, false);
assert.equal(result.automaticApplication, false);
assert.equal(result.evaluations.length, 12);
assert.equal(result.evaluations.find(row => row.theoryKey === "race-flow").matched, true);
assert.equal(result.evaluations.find(row => row.theoryKey === "wall-boat").matched, true);
assert.equal(result.evaluations.find(row => row.theoryKey === "double-time").matched, false);
assert.equal(result.evaluations.find(row => row.theoryKey === "new-engine").status, "not-used");

const rows = [structuredClone(record)];
assert.equal(builder.evaluateRows(rows), 1);
assert.equal(rows[0].theoryEvaluationSnapshot.catalogSize, 12);
assert.equal(builder.evaluateRows(rows), 0, "同じ評価は二重更新しない");

const pending = engine.build({ result: { settled: false } });
assert.equal(pending.status, "result-unavailable");
assert(pending.evaluations.every(row => row.status === "result-unavailable"));

console.log("理論評価エンジン Phase1: 合格");
