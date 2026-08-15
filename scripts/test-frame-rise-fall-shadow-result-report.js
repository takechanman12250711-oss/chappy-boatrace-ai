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
    selectedAt: new Date(Date.UTC(2026, 7, 15, 3, index)).toISOString(),
    frameRiseFallShadowAb: {
      candidateId: "frame-rise-fall-shadow-off-v1",
      candidateSpecFingerprint: "sha256:test",
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
  // B-only 12R, A-only 2R, both/neither are impossible with disjoint single tickets.
  // Remaining 86R are neither. B has a clear positive paired advantage without extra stake.
  const combination = index < 12 ? "2-1-3" : index < 14 ? "1-2-3" : "3-1-2";
  results.push(resultFor(row, combination, index < 12 ? 2000 : 1000));
}

const report = engine.build(
  [{ verificationPredictions: predictions }],
  [{ races: results }]
);
assert.equal(report.observation.eligibleComparableCount, 100);
assert.equal(report.observation.settledComparableCount, 100);
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
assert.equal(partial.observation.settledComparableCount, 5);
assert.equal(partial.status, "collecting-fixed-100-results");
assert.equal(partial.adoptionCandidate, false);

assert.equal(engine.oneSidedExactPValue(12, 2) <= 0.05, true);
const bootstrap = engine.pairedProfitBootstrap(report.rows, 1000);
assert.equal(bootstrap.confidenceLevel, 0.95);
assert.ok(Number.isFinite(bootstrap.lowerBound));

console.log("frame rise fall fixed-100 result report tests passed");
