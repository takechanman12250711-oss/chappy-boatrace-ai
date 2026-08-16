"use strict";

const assert = require("node:assert/strict");
const reportBuilder = require("./build-frame-rise-fall-negative-clip-result-report");
const trial = require("../config/frame-rise-fall-negative-clip-trial.json");

function record(index, candidateId = trial.candidateId) {
  const raceNo = (index % 12) + 1;
  const jcd = String(Math.floor(index / 12) + 1).padStart(2, "0");
  return {
    raceKey: `20260816-${jcd}-${raceNo}`,
    date: "20260816",
    jcd,
    raceNo,
    selectedAt: new Date(Date.UTC(2026, 7, 16, 11, index)).toISOString(),
    frameRiseFallNegativeClipShadowAb: {
      candidateId,
      implementationFingerprint: "frame-rise-fall-negative-adjustment-clip-v1",
      cutoff: trial.cutoff,
      comparisonContract: {
        comparableForFixed100: true,
        ticketContractViolations: 0
      },
      downstreamReplay: {
        status: "replay-ready",
        a: { skipDecision: false, practicalTickets: ["1-2-3"] },
        b: { skipDecision: false, practicalTickets: ["2-1-3"] }
      }
    }
  };
}

function resultFor(row, combination) {
  return {
    date: row.date,
    jcd: row.jcd,
    raceNo: row.raceNo,
    resultAvailable: true,
    status: "finished",
    trifecta: { combination, payout: 1000 }
  };
}

const current = record(0);
const other = record(1, "old-or-other-candidate");
const remapped = reportBuilder.remapPredictionDocuments([
  { verificationPredictions: [current, other] }
]);
assert.equal(remapped[0].verificationPredictions.length, 1);
assert.equal(remapped[0].verificationPredictions[0].raceKey, current.raceKey);
assert.equal(remapped[0].verificationPredictions[0].frameRiseFallShadowAb.candidateId, trial.candidateId);

const report = reportBuilder.buildReport(
  [{ verificationPredictions: [current, other] }],
  [{ races: [resultFor(current, "2-1-3"), resultFor(other, "1-2-3")] }]
);
assert.equal(report.candidateId, trial.candidateId);
assert.equal(report.observation.rawComparableCount, 1);
assert.equal(report.observation.eligibleComparableCount, 1);
assert.equal(report.overall.bOnlyHits, 1);
assert.equal(report.overall.aOnlyHits, 0);
assert.equal(report.productionAUnchanged, true);
assert.equal(report.automaticApplication, false);
assert.equal(report.usableForPrediction, false);

console.log("frame rise/fall negative clip result report test: ok");
