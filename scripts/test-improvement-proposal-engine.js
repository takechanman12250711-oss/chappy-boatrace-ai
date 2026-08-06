"use strict";

const assert = require("node:assert/strict");
const engine = require("../js/improvement-proposal-engine");

function record(index, codes) {
  return {
    raceKey: `20260806-20-${String(index).padStart(2, "0")}`,
    result: {
      settled: true,
      missCauseAnalysis: {
        practicalHit: false,
        candidates: codes.map((code, i) => ({ code, label: code, confidence: i === 0 ? "high" : "medium" }))
      }
    }
  };
}

const collecting = engine.build(Array.from({ length: 99 }, (_, i) => record(i + 1, ["flow-reading-miss"])));
assert.equal(collecting.status, "collecting-data");
assert.equal(collecting.proposalCount, 0);
assert.equal(collecting.remainingRaceCount, 1);

const ready = engine.build(Array.from({ length: 100 }, (_, i) => record(i + 1,
  i < 30 ? ["flow-reading-miss", "ticket-coverage-insufficient"] : ["ticket-coverage-insufficient"]
)));
assert.equal(ready.status, "proposal-candidates-ready");
assert.equal(ready.settledRaceCount, 100);
assert.equal(ready.proposalOnly, true);
assert.equal(ready.humanApprovalRequired, true);
assert.equal(ready.usableForPrediction, false);
assert.equal(ready.automaticApplication, false);
assert.equal(ready.uiVisible, false);
assert.equal(ready.proposals[0].code, "ticket-coverage-insufficient");
assert.equal(ready.proposals[0].sampleCount, 100);
assert.equal(ready.proposals.find(row => row.code === "flow-reading-miss").sampleCount, 30);
assert(ready.proposals.every(row => row.improvementCandidate && row.expectedEffect));

console.log("改善提案生成 Phase3: 合格");
