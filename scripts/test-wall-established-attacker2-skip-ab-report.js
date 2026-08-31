"use strict";

const assert = require("node:assert/strict");
const report = require("./build-wall-established-attacker2-skip-ab-report");

function wall(attackerNo = 2, state = "壁成立", formal = true) {
  return {
    attackerNo,
    wallCandidateNo: attackerNo === 2 ? 1 : 2,
    state,
    score: 80,
    grade: formal ? "A" : ""
  };
}

function record({
  date = "20260901",
  jcd = "01",
  raceNo,
  selectedAt,
  attackerNo = 2,
  state = "壁成立",
  formal = true,
  tickets = ["1-2-3"],
  result = null
}) {
  return {
    date,
    jcd,
    raceNo,
    selectedAt,
    prediction: {
      wallTheory: wall(attackerNo, state, formal),
      practicalTickets: tickets
    },
    ...(result ? { result } : {})
  };
}

const cutoff = report.PROSPECTIVE_CUTOFF;
const beforeCutoff = record({ raceNo: 9, selectedAt: "2026-08-31T09:32:22Z" });
const duplicateVerification = record({ raceNo: 1, selectedAt: cutoff, tickets: ["1-3-2"] });
const selectedWinner = record({ raceNo: 1, selectedAt: "2026-08-31T09:32:24Z", tickets: ["1-2-3", "2-1-3"] });
const miss = record({ raceNo: 2, selectedAt: "2026-08-31T09:32:25Z", tickets: ["1-2-3"] });
const embeddedWinner = record({
  date: "20260902",
  raceNo: 3,
  selectedAt: "2026-08-31T09:32:26Z",
  tickets: ["2-1-4"],
  result: { settled: true, resultTicket: "2-1-4", payoutPer100: 600 }
});
const noTickets = record({ date: "20260902", raceNo: 4, selectedAt: "2026-08-31T09:32:27Z", tickets: [] });
const wrongAttacker = record({ raceNo: 5, selectedAt: "2026-08-31T09:32:28Z", attackerNo: 3 });
const wrongState = record({ raceNo: 6, selectedAt: "2026-08-31T09:32:29Z", state: "壁崩れ" });
const informal = record({ raceNo: 7, selectedAt: "2026-08-31T09:32:30Z", formal: false });

const predDocs = [{
  predictions: [beforeCutoff, selectedWinner, miss, embeddedWinner, noTickets, wrongAttacker, wrongState, informal],
  verificationPredictions: [duplicateVerification]
}];
const resultDocs = [{
  races: [
    { date: "20260901", jcd: "01", raceNo: 1, resultAvailable: true, status: "finished", trifecta: { combination: "2-1-3", payout: 1000 } },
    { date: "20260901", jcd: "01", raceNo: 2, resultAvailable: true, status: "finished", trifecta: { combination: "1-3-2", payout: 500 } },
    { date: "20260902", jcd: "01", raceNo: 4, resultAvailable: true, status: "finished", trifecta: { combination: "1-2-3", payout: 700 } }
  ]
}];

assert.equal(report.isProspective(duplicateVerification), true, "cutoff must be inclusive");
assert.equal(report.isProspective(beforeCutoff), false, "pre-registration rows must be excluded");
assert.equal(report.isTarget(selectedWinner), true);
assert.equal(report.isTarget(wrongAttacker), false);
assert.equal(report.isTarget(wrongState), false);
assert.equal(report.isTarget(informal), false);

const built = report.build(predDocs, resultDocs);
assert.equal(built.productionChanged, false);
assert.equal(built.automaticApplication, false);
assert.equal(built.usableForPrediction, false);
assert.equal(built.affectsCurrentTickets, false);
assert.equal(built.preregistration.commit, "4d9e9a685ce6e2c202f33a36f4e88612e199ed75");
assert.equal(built.preregistration.oldRecordsBackfilled, false);
assert.equal(built.diagnostics.prospectiveRecordCountBeforeDedup, 8);
assert.equal(built.diagnostics.prospectiveRaceCountAfterDedup, 7);
assert.equal(built.diagnostics.targetRaceCount, 4);
assert.equal(built.diagnostics.targetSettledRaceCount, 4);
assert.equal(built.diagnostics.targetSettledBetRaceCount, 3);
assert.equal(built.diagnostics.targetSettledNoTicketRaceCount, 1);
assert.equal(built.diagnostics.distinctSettledDates, 2);

assert.equal(built.a.settledCount, 4);
assert.equal(built.a.betRaceCount, 3);
assert.equal(built.a.hitCount, 2, "selected record must win dedup over verification record");
assert.equal(built.a.stake, 400);
assert.equal(built.a.return, 1600);
assert.equal(built.a.profit, 1200);
assert.equal(built.a.recoveryRate, 400);
assert.equal(built.b.skippedRaceCount, 3);
assert.equal(built.b.stake, 0);
assert.equal(built.b.return, 0);
assert.equal(built.delta.avoidedLoss, -1200);
assert.equal(built.delta.missedHitCount, 2);
assert.equal(built.delta.missedPayout, 1600);

assert.equal(built.robustness.chronologicalSplit.firstHalf.raceCount, 2);
assert.equal(built.robustness.chronologicalSplit.firstHalf.delta.avoidedLoss, -700);
assert.equal(built.robustness.chronologicalSplit.secondHalf.raceCount, 2);
assert.equal(built.robustness.chronologicalSplit.secondHalf.delta.avoidedLoss, -500);
assert.equal(built.robustness.leaveOneOut.evaluated, true);
assert.equal(built.robustness.leaveOneOut.minimumRemainingAvoidedLoss, -1300);
assert.equal(built.robustness.leaveOneOut.worstRemovedRaceKey, "20260901-01-2");
assert.equal(built.checkpoints[0].status, "not-reached");
assert.equal(built.checkpoints[1].conditionsMet, false);

const passingContext = {
  targetSettledRaceCount: 100,
  aRecoveryRate: 70,
  avoidedLoss: 12000,
  distinctDates: 12,
  firstHalfAvoidedLoss: 5000,
  secondHalfAvoidedLoss: 7000,
  leaveOneOutMinimumAvoidedLoss: 9000,
  missedHitCount: 8,
  missedPayout: 15000
};
const passing = report.evaluateCheckpoint({
  targetSettledRaceCount: 100,
  decision: "manual-review-candidate-only",
  conditions: {
    aRecoveryRateAtMost: 80,
    avoidedLossYenAtLeast: 10000,
    distinctDatesAtLeast: 10,
    firstHalfAvoidedLossYenAtLeast: 0,
    secondHalfAvoidedLossYenAtLeast: 0,
    leaveOneOutMinimumAvoidedLossYenAtLeast: 0,
    missedHitsAndPayoutMustBeShown: true
  }
}, passingContext);
assert.equal(passing.reached, true);
assert.equal(passing.conditionsMet, true);
assert.equal(passing.status, "conditions-met-awaiting-manual-approval");

const failing = report.evaluateCheckpoint({
  targetSettledRaceCount: 100,
  decision: "manual-review-candidate-only",
  conditions: {
    aRecoveryRateAtMost: 80,
    avoidedLossYenAtLeast: 10000,
    distinctDatesAtLeast: 10,
    firstHalfAvoidedLossYenAtLeast: 0,
    secondHalfAvoidedLossYenAtLeast: 0,
    leaveOneOutMinimumAvoidedLossYenAtLeast: 0,
    missedHitsAndPayoutMustBeShown: true
  }
}, { ...passingContext, secondHalfAvoidedLoss: -1 });
assert.equal(failing.conditionsMet, false);
assert.equal(failing.status, "conditions-not-met");

console.log("wall-established attacker2 skip prospective A/B test: ok");
