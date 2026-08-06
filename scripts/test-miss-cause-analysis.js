"use strict";

const assert = require("node:assert/strict");
const analyzer = require("../js/miss-cause-analysis");
const builder = require("./build-miss-cause-analysis");

const record = {
  result: {
    settled: true,
    resultTicket: "3-1-4",
    practicalHit: false,
    review: { practicalHit: false, missType: "完全抜け", scenarioMatch: false }
  },
  prediction: {
    practicalTickets: ["1-2-3", "1-2-4", "1-3-2", "1-3-4", "2-1-3", "2-1-4", "4-1-2", "4-1-3"]
  },
  theoryEvaluationSnapshot: {
    evaluations: [
      { theoryKey: "race-flow", label: "展開理論", status: "evaluated", matched: false, tickets: ["1-2-3"] },
      { theoryKey: "start", label: "ST・スリット理論", status: "evaluated", matched: false, tickets: ["1-3-4"] },
      { theoryKey: "wall-boat", label: "壁艇理論", status: "not-used", matched: null, tickets: [] }
    ]
  }
};

const result = analyzer.build(record);
assert.equal(result.status, "candidates-recorded");
assert.equal(result.causalClaim, false);
assert.equal(result.uiVisible, false);
assert(result.candidates.some(row => row.code === "ticket-coverage-insufficient"));
assert(result.candidates.some(row => row.code === "ticket-spread-too-wide"));
assert(result.candidates.some(row => row.code === "flow-reading-miss"));
assert(result.candidates.some(row => row.code === "start-adjustment-insufficient"));
assert(!result.candidates.some(row => row.code === "wall-boat-evaluation-insufficient"));

const rows = [structuredClone(record)];
assert.equal(builder.evaluateRows(rows), 1);
assert.equal(rows[0].result.missCauseAnalysis.causeCount, result.causeCount);
assert.equal(builder.evaluateRows(rows), 0);

const hit = analyzer.build({ result: { settled: true, practicalHit: true }, prediction: { practicalTickets: ["1-2-3"] } });
assert.equal(hit.status, "hit-no-miss-analysis");
assert.equal(hit.causeCount, 0);

console.log("外れ原因分析 Phase2: 合格");
