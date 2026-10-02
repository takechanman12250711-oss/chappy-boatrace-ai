"use strict";

const assert = require("node:assert/strict");
const audit = require("./build-local-water-priority-selection-consistency-audit");

assert.equal(audit.exactTicketHead("5-1-2"), 5);
assert.equal(audit.exactTicketHead("6-23-全"), 6);
assert.equal(audit.exactTicketHead("風速5m"), null);
assert.equal(audit.valueAtPath({ a: [{ b: 3 }] }, "a[0].b"), 3);
assert.equal(audit.priorityScore({ priorityScore: 88 }), 88);
assert.equal(audit.roleClass({ roleLabels: ["alternate-head"] }), "head");
assert.equal(audit.selectionState({ selected: false, reason: "既存フォーメーションに同一買い目あり" }).duplicate, true);

function sourceRow(raceNo, actualHead, finalHead, winnerScore, finalScore) {
  const gap = finalScore - winnerScore;
  return {
    date: "20260830",
    jcd: "10",
    raceNo,
    actualHead,
    finalHead,
    comparable: true,
    primaryComparison: {
      path: "practicalSelection.targetDecisions[0].candidateDecisions",
      winnerScore,
      finalScore,
      gap,
      winnerAhead: gap < 0,
      tied: gap === 0,
      winnerOutscored: gap > 0,
      duplicateReason: false
    }
  };
}

function candidate(boatNo, score, extra = {}) {
  return {
    boatNo,
    ticket: `${boatNo}-1-2`,
    roleLabels: ["alternate-head"],
    eligiblePositions: [1],
    priorityScore: score,
    ...extra
  };
}

function prediction(raceNo, rows) {
  return {
    date: "20260830",
    jcd: "10",
    raceNo,
    prediction: {
      practicalSelection: {
        targetDecisions: [{ candidateDecisions: rows }]
      }
    }
  };
}

const source = {
  version: "local-water-outer-head-priority-score-audit-v1",
  generatedAt: "2026-08-30T00:00:00.000Z",
  nextStep: "audit-local-water-priority-selection-consistency",
  metrics: { scoreComparableCount: 6 },
  targetRaces: [
    sourceRow(1, 5, 1, 90, 80),
    sourceRow(2, 6, 2, 85, 80),
    sourceRow(3, 5, 3, 80, 80),
    sourceRow(4, 6, 4, 80, 80),
    sourceRow(5, 5, 1, 80, 80),
    sourceRow(6, 6, 2, 80, 80)
  ]
};

const predictions = [{ predictions: [
  prediction(1, [
    candidate(1, 80, { selected: true }),
    candidate(5, 90)
  ]),
  prediction(2, [
    candidate(2, 80, { selected: true }),
    candidate(6, 85, { selected: false, reason: "優先順位で非採用" })
  ]),
  prediction(3, [
    candidate(3, 80, { selected: true }),
    candidate(5, 80)
  ]),
  prediction(4, [
    candidate(6, 80),
    candidate(4, 80, { selected: true })
  ]),
  prediction(5, [
    candidate(1, 80, { selected: true }),
    candidate(5, 80, { selected: false, reason: "既存フォーメーションに同一買い目あり" })
  ]),
  prediction(6, [
    candidate(2, 80, { selected: true }),
    candidate(6, 80, { rejectionReason: "採用境界で見送り" })
  ])
] }];

const report = audit.build(source, predictions);
assert.equal(report.productionChanged, false);
assert.equal(report.automaticApplication, false);
assert.equal(report.usableForPrediction, false);
assert.equal(report.applicable, true);
assert.equal(report.metrics.targetCount, 6);
assert.equal(report.metrics.resolvedPairCount, 6);
assert.equal(report.metrics.resolvedPairCoverageRate, 100);
assert.equal(report.metrics.strictInversionCount, 2);
assert.equal(report.metrics.tiedCount, 4);
assert.equal(report.classifications["winner-ahead-selector-inversion"], 1);
assert.equal(report.classifications["winner-ahead-explicit-rejection"], 1);
assert.equal(report.classifications["tie-final-earlier-order"], 1);
assert.equal(report.classifications["tie-winner-earlier-but-lost"], 1);
assert.equal(report.classifications["tie-duplicate-rejection"], 1);
assert.equal(report.classifications["tie-explicit-rejection"], 1);
assert.equal(report.nextStep, "build-local-water-priority-selector-shadow-replay");

const notApplicable = audit.build({
  version: "local-water-outer-head-priority-score-audit-v1",
  nextStep: "continue-monitoring",
  targetRaces: []
}, []);
assert.equal(notApplicable.applicable, false);
assert.equal(notApplicable.nextStep, "follow-priority-score-audit-next-step");

console.log("local water priority selection consistency audit test: ok");
