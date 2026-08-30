"use strict";

const assert = require("node:assert/strict");
const audit = require("./build-local-water-outer-head-role-qualification-audit");

function example(index, classification, flags, extra = {}) {
  return {
    date: "20260830",
    jcd: "10",
    raceNo: index + 1,
    venue: index % 2 ? "三国" : "若松",
    conditionBand: index % 3 === 0 ? "strong" : "calm",
    actualHead: index % 2 ? 5 : 6,
    finalHead: 1,
    classification,
    blockerFlags: flags,
    strongestScore: { field: "score", value: 70 + index },
    roles: ["pickup"],
    eligiblePositionsSeen: [3],
    reasons: ["保存済み理由"],
    ...extra
  };
}

const qualificationExamples = [];
for (let index = 0; index < 10; index++) {
  qualificationExamples.push(example(
    index,
    "support-only-not-head-eligible",
    ["support-visible-but-no-head-role", "role-intent-without-head"]
  ));
}
for (let index = 10; index < 15; index++) {
  qualificationExamples.push(example(
    index,
    "no-saved-outer-head-evidence",
    ["position-1-not-eligible"]
  ));
}
for (let index = 15; index < 18; index++) {
  qualificationExamples.push(example(
    index,
    "candidate-head-not-promoted",
    ["head-candidate-not-promoted"]
  ));
}
for (let index = 18; index < 20; index++) {
  qualificationExamples.push(example(index, "final-correct", []));
}

const report = audit.build({
  version: "local-water-outer-head-bottleneck-audit-v1",
  generatedAt: "2026-08-30T00:00:00.000Z",
  diagnosisFocus: "inspect-head-role-qualification-blockers",
  examples: qualificationExamples
});

assert.equal(report.productionChanged, false);
assert.equal(report.automaticApplication, false);
assert.equal(report.usableForPrediction, false);
assert.equal(report.applicable, true);
assert.equal(report.sampleCount, 20);
assert.equal(report.primaryBlockerCounts["support-visible-no-head-role"], 10);
assert.equal(report.primaryBlockerCounts["position-1-not-eligible"], 5);
assert.equal(report.primaryBlockerCounts["downstream-scenario-promotion"], 3);
assert.equal(report.primaryBlockerCounts["already-final-correct"], 2);
assert.equal(report.qualificationSideCount, 15);
assert.equal(report.qualificationSideRate, 75);
assert.equal(report.nextStep, "build-outer-head-eligibility-counterfactual-grid");
assert.equal(report.eligiblePositionPatterns["3"], 20);
assert.equal(report.examples.length, 20);

const notApplicable = audit.build({
  version: "local-water-outer-head-bottleneck-audit-v1",
  diagnosisFocus: "inspect-selected-head-ranking-blockers",
  examples: qualificationExamples
});
assert.equal(notApplicable.applicable, false);
assert.equal(notApplicable.nextStep, "follow-upstream-diagnosis-focus");

const downstreamExamples = Array.from({ length: 20 }, (_, index) =>
  example(index, "scenario-head-not-selected", ["head-scenario-not-selected"])
);
const downstream = audit.build({
  version: "local-water-outer-head-bottleneck-audit-v1",
  diagnosisFocus: "inspect-head-role-qualification-blockers",
  examples: downstreamExamples
});
assert.equal(downstream.qualificationSideCount, 0);
assert.equal(downstream.nextStep, "audit-outer-head-selected-ranking");

const small = audit.build({
  version: "local-water-outer-head-bottleneck-audit-v1",
  diagnosisFocus: "inspect-head-role-qualification-blockers",
  examples: qualificationExamples.slice(0, 19)
});
assert.equal(small.nextStep, "continue-collecting-role-qualification-evidence");

assert.equal(audit.primaryBlocker({
  classification: "support-only-not-head-eligible",
  blockerFlags: []
}), "support-visible-no-head-role");
assert.equal(audit.normalizeSignal("role-intent-without-head"), "head-intent-missing");
assert.equal(audit.scoreBand({ value: 79 }), "65to79");
assert.equal(audit.positionPattern([3, 1, 3]), "1,3");

console.log("local water outer head role qualification audit test: ok");
