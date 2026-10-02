"use strict";

const assert = require("node:assert/strict");
const analysis = require("../js/theory-candidate-branch-analysis-phase9");

function record(index, options = {}) {
  const scoreAdjustment = options.scoreAdjustment ?? (index % 2 ? 3 : -2);
  const type = options.type || (index % 2 ? "sink" : "rise");
  const ticket = "1-2-3";
  const hit = options.hit ?? index % 5 === 0;
  const day = 10 + Math.floor(index / 12);
  const raceNo = index % 12 + 1;
  return {
    raceKey: `202608${String(day).padStart(2, "0")}-01-${raceNo}`,
    date: `202608${String(day).padStart(2, "0")}`,
    selectedAt: new Date(Date.UTC(2026, 7, 10, 0, index)).toISOString(),
    jcd: "01",
    place: "桐生",
    raceNo,
    result: { settled: true, payout: 1000, practicalHit: hit },
    theoryTagSnapshot: {
      theories: options.formalTheory === false ? [] : [{ theoryKey: "frameRiseSink", formal: true }],
      evidenceDiagnostics: {
        rows: [{
          theoryKey: "frame-rise-fall",
          formal: options.formalDiagnostic !== false,
          metrics: {
            frameNo: (index % 4) + 1,
            type,
            samples: 100,
            rate: 40,
            scenarioType: ["escape", "sashi", "threeAttack", "fourAttack"][index % 4],
            scoreAdjustment,
            movementDelta: scoreAdjustment * 4,
            approved: true,
            applied: true
          }
        }]
      }
    },
    theoryEvaluationSnapshot: {
      evaluations: options.evaluated === false ? [] : [{
        theoryKey: "frame-rise-fall",
        status: "evaluated",
        used: true,
        matched: hit,
        tickets: [ticket, ticket]
      }]
    }
  };
}

const phase9 = {
  status: "proposal-ready",
  proposalCount: 1,
  proposal: {
    theoryKey: "frame-rise-fall",
    evidenceCount: 30,
    focusMetric: "recoveryRate",
    currentValue: 46.5,
    changeCandidate: analysis.SUPPORTED_CHANGE_CANDIDATE,
    approved: false
  }
};

let report = analysis.build([], {});
assert.equal(report.status, "waiting-for-phase9-proposal");
assert.equal(report.candidate, null);

report = analysis.build(Array.from({ length: 30 }, (_, index) => record(index)), {
  ...phase9,
  proposal: { theoryKey: "race-flow", evidenceCount: 30 }
});
assert.equal(report.status, "unsupported-phase9-theory");

report = analysis.build(Array.from({ length: 30 }, (_, index) => record(index)), {
  ...phase9,
  proposal: { ...phase9.proposal, focusMetric: "hitRate" }
});
assert.equal(report.status, "unsupported-phase9-proposal");
assert.equal(report.candidate, null);

report = analysis.build(Array.from({ length: 29 }, (_, index) => record(index)), phase9);
assert.equal(report.status, "collecting-formal-evidence");
assert.equal(report.formalRaceCount, 29);

report = analysis.build(Array.from({ length: 30 }, (_, index) => record(index)), {
  ...phase9,
  proposal: { ...phase9.proposal, evidenceCount: 31 }
});
assert.equal(report.status, "evidence-count-mismatch");
assert.equal(report.candidate, null);
assert.equal(report.evidenceConsistency.exactMatch, false);

const missingMetrics = record(50);
missingMetrics.theoryTagSnapshot.evidenceDiagnostics.rows[0].metrics.scoreAdjustment = null;
assert.equal(analysis.buildRows([missingMetrics]).length, 0, "欠損補正値を0として扱わない");

const invalidFrame = record(51);
invalidFrame.theoryTagSnapshot.evidenceDiagnostics.rows[0].metrics.frameNo = 7;
assert.equal(analysis.buildRows([invalidFrame]).length, 0, "1〜6外のframeNoを除外する");

const invalidTicket = record(52);
invalidTicket.theoryEvaluationSnapshot.evaluations[0].tickets = ["1-1-2"];
assert.equal(analysis.buildRows([invalidTicket]).length, 0, "重複艇の買い目を除外する");
assert.equal(analysis.normalizeTicket("1-2-3-4"), "", "4艇以上を3連単へ切り詰めない");
assert.equal(analysis.normalizeTicket("x1-2-3y"), "", "前後に文字がある買い目を受理しない");
assert.equal(analysis.normalizeTicket("10-2-3"), "", "2桁艇番を部分一致で受理しない");
assert.equal(analysis.normalizeTicket("1=2-3"), "", "フォーメーション表記を単一券へ縮約しない");

const invalidRaceKey = record(52);
invalidRaceKey.__analysisRaceKey = invalidRaceKey.raceKey;
invalidRaceKey.raceKey = "invalid-race-key";
assert.equal(analysis.buildRows([invalidRaceKey]).length, 0, "不正raceKeyからfallbackしない");

const timezoneMissing = record(52);
timezoneMissing.selectedAt = "2026-08-10T00:00:00";
assert.equal(analysis.buildRows([timezoneMissing]).length, 0, "timezoneなしselectedAtを受理しない");

const duplicate = record(53);
assert.throws(
  () => analysis.buildRows([duplicate, structuredClone(duplicate)]),
  /raceKeyが重複/,
  "正式証拠raceKeyの重複をfail-closedにする"
);

const timezoneEarlier = record(54);
timezoneEarlier.selectedAt = "2026-08-10T00:00:00+09:00";
const timezoneLater = record(55);
timezoneLater.selectedAt = "2026-08-09T16:00:00Z";
assert.deepEqual(
  analysis.buildRows([timezoneLater, timezoneEarlier]).map(row => row.raceKey),
  [timezoneEarlier.raceKey, timezoneLater.raceKey],
  "timezone表記ではなくepochで時系列化する"
);

const records = Array.from({ length: 33 }, (_, index) => record(index));
records.push(record(40, { formalDiagnostic: false }));
records.push(record(41, { formalTheory: false }));
records.push(record(42, { evaluated: false }));
report = analysis.build(records, {
  ...phase9,
  proposal: { ...phase9.proposal, evidenceCount: 33 }
});
assert.equal(report.status, "candidate-ready-for-human-review");
assert.equal(report.formalRaceCount, 33, "formal診断・formal理論・evaluatedの3条件を要求する");
assert.equal(report.evidenceConsistency.exactMatch, true);
assert.equal(report.candidateCount, 1);
assert.equal(report.candidate.candidateId, "frame-rise-fall-shadow-off-v1");
assert.match(report.candidate.candidateSpecFingerprint, /^sha256:[0-9a-f]{64}$/);
assert.equal(report.candidate.sourceProposalFingerprint, report.phase9ProposalFingerprint);
assert.equal(report.candidate.approvedSpecFingerprint, null);
assert.equal(report.candidate.proposedChange.effectiveValue, 0);
assert.equal(report.candidate.approved, false);
assert.equal(report.candidate.shadowImplementationPresent, false);
assert.equal(report.candidate.prospectiveProtocol.fixedComparableRaces, 100);
assert.equal(report.candidate.prospectiveProtocol.earlyStoppingAllowed, false);
assert.equal(report.chronologicalThirds.length, 3);
assert.deepEqual(report.chronologicalThirds.map(row => row.raceCount), [11, 11, 11]);
assert.equal(report.retrospectiveLimits.independentHoldout, false);
assert.equal(report.retrospectiveLimits.historicalBPerformanceClaimAllowed, false);
assert.equal(report.directionCaution.mismatchCount, 33);
assert.equal(report.oneCandidateOnly, true);
assert.equal(report.causalClaim, false);
assert.equal(report.humanApprovalRequired, true);
assert.equal(report.automaticApplication, false);
assert.equal(report.usableForPrediction, false);
assert.equal(report.uiVisible, false);
assert.equal(report.overall.ticketCount, 33, "重複買い目は1点として集計する");
assert.equal(report.overall.stake, 3300);
assert.equal(report.overall.hitCount, 7);
assert.equal(report.overall.return, 7000);

const changedOutcomes = structuredClone(records);
changedOutcomes.forEach(row => {
  row.result.payout += 777;
  row.result.practicalHit = !row.result.practicalHit;
  const evaluation = row.theoryEvaluationSnapshot.evaluations[0];
  if (evaluation) evaluation.matched = !evaluation.matched;
});
const changedOutcomeReport = analysis.build(changedOutcomes, {
  ...phase9,
  proposal: { ...phase9.proposal, evidenceCount: 33 }
});
assert.equal(
  changedOutcomeReport.candidate.candidateSpecFingerprint,
  report.candidate.candidateSpecFingerprint,
  "結果を入れ替えても事前固定する候補仕様は変えない"
);
assert.notEqual(
  changedOutcomeReport.cohortFingerprint,
  report.cohortFingerprint,
  "結果を入れ替えた母集団は別fingerprintにする"
);

console.log("theory candidate branch analysis phase9 tests passed");
