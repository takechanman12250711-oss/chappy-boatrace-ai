"use strict";

const assert = require("node:assert/strict");
const engine = require("../js/frame-rise-fall-shadow-result-report");

function prediction(index, options = {}) {
  const raceNo = (index % 12) + 1;
  const jcd = String(Math.floor(index / 12) + 1).padStart(2, "0");
  const raceKey = `20260815-${jcd}-${raceNo}`;
  const aTicket = options.aTicket || "1-2-3";
  const bTicket = options.bTicket || "2-1-3";
  return {
    raceKey,
    date: "20260815",
    jcd,
    raceNo,
    selectedAt: options.selectedAt || new Date(Date.UTC(2026, 7, 15, 3, index)).toISOString(),
    frameRiseFallShadowAb: {
      candidateId: options.candidateId || "frame-rise-fall-shadow-off-v1",
      candidateSpecFingerprint: options.candidateSpecFingerprint || "sha256:test",
      implementationFingerprint: options.implementationFingerprint || "sha256:impl",
      cutoff: {
        selectedAtExclusiveLowerBound: options.cutoff || "2026-08-15T02:00:00.000Z",
        sourceCommit: options.sourceCommit || "abc123",
        logicFingerprint: options.logicFingerprint || "logic-v1"
      },
      comparisonContract: {
        comparableForFixed100: true,
        ticketContractViolations: options.violations || 0
      },
      downstreamReplay: {
        status: "replay-ready",
        a: { skipDecision: false, mainScenario: { type: "escape", headBoatNo: 1 }, practicalTickets: [aTicket] },
        b: { skipDecision: false, mainScenario: { type: "sashi", headBoatNo: 2 }, practicalTickets: [bTicket] }
      }
    }
  };
}

function resultFor(record, combination, payout = 1000) {
  return {
    date: record.date,
    jcd: record.jcd,
    raceNo: record.raceNo,
    resultAvailable: true,
    status: "finished",
    trifecta: { combination, payout }
  };
}

const predictions = [];
const results = [];
for (let index = 0; index < 100; index += 1) {
  const row = prediction(index);
  predictions.push(row);
  const combination = index < 12 ? "2-1-3" : index < 14 ? "1-2-3" : "3-1-2";
  results.push(resultFor(row, combination, index < 12 ? 2000 : 1000));
}

const report = engine.build(
  [{ verificationPredictions: predictions }],
  [{ races: results }]
);
assert.equal(report.observation.rawComparableCount, 100);
assert.equal(report.observation.eligibleComparableCount, 100);
assert.equal(report.observation.excludedOtherCohortCount, 0);
assert.equal(report.observation.fixedPoolCount, 100);
assert.equal(report.observation.settledComparableCount, 100);
assert.equal(report.observation.pendingFixedPoolResults, 0);
assert.equal(report.overall.bOnlyHits, 12);
assert.equal(report.overall.aOnlyHits, 2);
assert.equal(report.overall.netBOnlyHits, 10);
assert.ok(report.pairedOutcomeExactTest.pValue <= 0.05);
assert.ok(report.overall.bRecoveryRate > report.overall.aRecoveryRate);
assert.ok(report.overall.profitDelta > 0);
assert.equal(report.overall.bStake, report.overall.aStake);
assert.equal(report.overall.ticketContractViolations, 0);
assert.equal(report.adoptionChecks.fixed100Complete, true);
assert.equal(report.automaticApplication, false);
assert.equal(report.usableForPrediction, false);

const partial = engine.build(
  [{ verificationPredictions: predictions.slice(0, 19) }],
  [{ races: results.slice(0, 5) }]
);
assert.equal(partial.observation.eligibleComparableCount, 19);
assert.equal(partial.observation.fixedPoolCount, 19);
assert.equal(partial.observation.settledComparableCount, 5);
assert.equal(partial.observation.pendingFixedPoolResults, 14);
assert.equal(partial.status, "collecting-fixed-100-results");
assert.equal(partial.adoptionCandidate, false);

const orderedPredictions = [];
const orderedResults = [];
for (let index = 0; index < 101; index += 1) {
  const row = prediction(index);
  orderedPredictions.push(row);
  if (index > 0) orderedResults.push(resultFor(row, "3-1-2", 1000));
}
const frozenOrder = engine.build(
  [{ verificationPredictions: orderedPredictions }],
  [{ races: orderedResults }]
);
assert.equal(frozenOrder.observation.eligibleComparableCount, 101);
assert.equal(frozenOrder.observation.fixedPoolCount, 100);
assert.equal(frozenOrder.observation.settledComparableCount, 99);
assert.equal(frozenOrder.observation.pendingFixedPoolResults, 1);
assert.equal(frozenOrder.adoptionChecks.fixed100Complete, false);
assert.equal(frozenOrder.rows.some(row => row.raceKey === orderedPredictions[100].raceKey), false);

const mixedPredictions = predictions.slice(0, 19);
const changedCandidate = prediction(20, {
  candidateSpecFingerprint: "sha256:new-spec",
  implementationFingerprint: "sha256:new-impl",
  cutoff: "2026-08-15T04:00:00.000Z",
  sourceCommit: "def456",
  logicFingerprint: "logic-v2"
});
mixedPredictions.push(changedCandidate);
const mixed = engine.build(
  [{ verificationPredictions: mixedPredictions }],
  [{ races: [...results.slice(0, 19), resultFor(changedCandidate, "2-1-3", 2000)] }]
);
assert.equal(mixed.observation.rawComparableCount, 20);
assert.equal(mixed.observation.eligibleComparableCount, 19);
assert.equal(mixed.observation.excludedOtherCohortCount, 1);
assert.equal(mixed.activeCohort.candidateSpecFingerprint, "sha256:test");
assert.equal(mixed.rows.some(row => row.raceKey === changedCandidate.raceKey), false);

// Re-saving the same race under a later cohort must not overwrite the original
// trial row. Deduplication is allowed only inside the same cohort.
const sameRaceOld = prediction(0);
const sameRaceNew = prediction(0, {
  selectedAt: "2026-08-15T05:00:00.000Z",
  candidateSpecFingerprint: "sha256:new-spec",
  implementationFingerprint: "sha256:new-impl",
  cutoff: "2026-08-15T04:00:00.000Z",
  sourceCommit: "def456",
  logicFingerprint: "logic-v2"
});
const sameRaceAcrossCohorts = engine.build(
  [{ verificationPredictions: [...predictions.slice(0, 19), sameRaceNew] }],
  [{ races: results.slice(0, 19) }]
);
assert.equal(sameRaceAcrossCohorts.observation.rawComparableCount, 20);
assert.equal(sameRaceAcrossCohorts.observation.eligibleComparableCount, 19);
assert.equal(sameRaceAcrossCohorts.observation.excludedOtherCohortCount, 1);
assert.equal(sameRaceAcrossCohorts.activeCohort.candidateSpecFingerprint, "sha256:test");
assert.equal(sameRaceAcrossCohorts.observation.settledComparableCount, 19);
assert.equal(sameRaceAcrossCohorts.rows.some(row => row.raceKey === sameRaceOld.raceKey), true);

assert.equal(engine.oneSidedExactPValue(12, 2) <= 0.05, true);
const bootstrap = engine.pairedProfitBootstrap(report.rows, 1000);
assert.equal(bootstrap.confidenceLevel, 0.95);
assert.ok(Number.isFinite(bootstrap.lowerBound));

console.log("frame rise fall fixed-100 result report tests passed");
