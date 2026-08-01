"use strict";

const assert = require("node:assert/strict");
const gate = require("../js/scenario-likelihood-v5-approval-gate");

function makeRows(count, options = {}) {
  const expected = Number(options.expected ?? 40);
  const hitRate = Number(options.hitRate ?? 52);
  const jcd = String(options.jcd || "20");
  const scenario = String(options.scenario || "3攻め");
  const ambiguity = String(options.ambiguity || "clear");
  const hits = Math.round(count * hitRate / 100);
  return Array.from({ length: count }, (_, index) => ({
    comparable: true,
    raceKey: `2026${String(101 + index).padStart(4, "0")}-${jcd}-${(index % 12) + 1}`,
    jcd,
    actualScenario: scenario,
    leaderScenario: scenario,
    ambiguity,
    leaderLikelihood: expected,
    leaderHit: index < hits,
    topTwoHit: true
  }));
}

{
  const rows = makeRows(120, { expected: 40, hitRate: 52 });
  const result = gate.evaluateBucket("20:3攻め", rows, {
    minimumSamples: 100,
    minimumHalfSamples: 25,
    minimumGap: 8,
    maximumHalfGapDifference: 8,
    maximumAdjustmentPoints: 5
  });
  assert.equal(result.approved, true);
  assert.equal(result.action, "raise");
  assert.equal(result.adjustmentPoints, 5);
  assert.equal(result.applicationMode, "shadow-only");
  assert.equal(result.usableForPrediction, false);
}

{
  const rows = makeRows(40, { expected: 40, hitRate: 55 });
  const result = gate.evaluateBucket("3攻め", rows, {
    minimumSamples: 50,
    minimumHalfSamples: 20
  });
  assert.equal(result.approved, false);
  assert.ok(result.reasonCodes.includes("insufficient_samples"));
}

{
  const first = makeRows(60, { expected: 40, hitRate: 60 });
  const second = makeRows(60, { expected: 40, hitRate: 30 }).map((row, index) => ({
    ...row,
    raceKey: `2027${String(101 + index).padStart(4, "0")}-20-${(index % 12) + 1}`
  }));
  const result = gate.evaluateBucket("20:3攻め", [...first, ...second], {
    minimumSamples: 100,
    minimumHalfSamples: 25,
    minimumGap: 8,
    maximumHalfGapDifference: 8
  });
  assert.equal(result.approved, false);
  assert.ok(result.reasonCodes.includes("direction_not_stable"));
}

{
  const report = gate.build(makeRows(120), {});
  assert.equal(report.applicationMode, "shadow-only");
  assert.equal(report.automaticApplication, false);
  assert.equal(report.usableForPrediction, false);
  assert.ok(report.approvedCandidateCount >= 1);
}

console.log("scenario likelihood v5 approval gate tests passed");
