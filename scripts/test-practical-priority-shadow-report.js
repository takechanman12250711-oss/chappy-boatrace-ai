"use strict";

const assert = require("node:assert/strict");
const priorityShadow = require(
  "../js/practical-priority-shadow"
);
const reportApi = require(
  "../js/practical-priority-shadow-report"
);
const reportBuilder = require(
  "./build-practical-priority-shadow-report"
);
const charter = require(
  "../config/chappy-charter.json"
).practicalPriorityProspectiveShadow;

assert.equal(
  reportApi.CONTRACT_START_DATE,
  charter.startDate
);
assert.equal(
  reportApi.TARGET_REPLACEMENT_COUNT,
  charter.targetReplacementCount
);
assert.equal(
  reportApi.MINIMUM_DISCORDANT_COUNT,
  charter.minimumDiscordantCount
);
assert.equal(
  reportApi.MAXIMUM_LOSS_COUNT,
  charter.maximumLossCount
);
assert.equal(
  reportApi.MAXIMUM_ONE_SIDED_P_VALUE,
  charter.maximumOneSidedPValue
);

function row(index, outcome = "neutral") {
  const raceNo = index + 1;
  const capturedAt = new Date(
    Date.UTC(2026, 7, 13, 0, index, 0)
  ).toISOString();
  const deadlineAt = new Date(
    Date.UTC(2026, 7, 13, 0, index + 1, 0)
  ).toISOString();
  const baseTickets = [
    "1-2-3",
    "1-2-4",
    "1-3-4",
    "1-3-5",
    "2-1-3"
  ];
  const shadowTickets = [
    ...baseTickets.slice(0, 4),
    "1-3-6"
  ];
  const actualTicket = outcome === "gain"
    ? "1-3-6"
    : outcome === "loss"
      ? "2-1-3"
      : "6-5-4";
  return {
    raceKey:
      `20260813-01-${String(raceNo).padStart(3, "0")}`,
    date: "20260813",
    deadlineAt,
    selectedAt: capturedAt,
    practicalPriorityShadow: {
      eligible: true,
      logicFingerprint:
        priorityShadow.LOGIC_FINGERPRINT,
      cohortContractFingerprint:
        reportApi.CONTRACT_FINGERPRINT,
      sourceSelectionFingerprint:
        reportApi.REGISTERED_CONTRACT
          .sourceSelectionFingerprint,
      capturedAt,
      sourceCommit: "test",
      baseTickets,
      shadowTickets,
      replacement: {
        addedTicket: "1-3-6",
        removedTicket: "2-1-3",
        addedPriorityScore: 92,
        removedPriorityScore: 75
      }
    },
    result: {
      settled: true,
      resultTicket: actualTicket,
      payoutPer100: outcome === "gain" ? 1000 : 500
    }
  };
}

assert.equal(
  reportApi.oneSidedBinomialPValue(6, 0),
  0.015625
);
assert.equal(
  reportApi.oneSidedBinomialPValue(6, 1),
  0.0625
);

const collecting = reportApi.build([
  row(0, "gain")
]);
assert.equal(
  collecting.status,
  "collecting-prospective-shadow"
);
assert.equal(collecting.cohortCount, 1);
assert.equal(collecting.automaticApplication, false);
assert.equal(collecting.usableForPrediction, false);

const passingRows = Array.from(
  { length: 100 },
  (_, index) => row(
    index,
    [0, 1, 2, 50, 51, 52]
      .includes(index)
      ? "gain"
      : "neutral"
  )
);
const passing = reportApi.build(passingRows);
assert.equal(passing.status, "review-candidate-ready");
assert.equal(passing.metrics.gains, 6);
assert.equal(passing.metrics.losses, 0);
assert.equal(passing.metrics.returnDelta, 6000);
assert.equal(passing.halves.first.hitDelta, 3);
assert.equal(passing.halves.second.hitDelta, 3);
assert.equal(passing.reviewCandidateReady, true);
assert.equal(passing.requiresHumanApproval, true);

const failingRows = passingRows.map((value, index) =>
  index === 3 ? row(index, "loss") : value
);
const failing = reportApi.build(failingRows);
assert.equal(
  failing.status,
  "review-candidate-rejected"
);
assert.equal(failing.metrics.losses, 1);
assert.equal(failing.checks.exactTestPass, false);
assert.equal(failing.reviewCandidateReady, false);

const pendingRows = passingRows.map((value, index) =>
  index === 99
    ? { ...value, result: { settled: false } }
    : value
);
assert.equal(
  reportApi.build(pendingRows).status,
  "awaiting-cohort-settlement"
);

const voidRows = passingRows.map((value, index) =>
  index === 99
    ? {
      ...value,
      result: {
        settled: false,
        status: "void",
        void: true
      }
    }
    : value
);
const voidReport = reportApi.build([
  ...voidRows,
  row(100, "gain")
]);
assert.equal(
  voidReport.status,
  "review-candidate-ready",
  "不成立は固定100件から差し替えず中立解決として扱う"
);
assert.equal(voidReport.metrics.resolvedCount, 100);
assert.equal(voidReport.metrics.settledCount, 99);
assert.equal(voidReport.metrics.voidCount, 1);
assert.equal(voidReport.metrics.pendingCount, 0);
assert.equal(voidReport.samples.at(-1).void, true);
assert.ok(
  !voidReport.samples.some(value =>
    value.raceKey === row(100).raceKey
  ),
  "不成立を101件目の結果で置き換えない"
);

const invalidPayoutRows = passingRows.map(
  (value, index) =>
    index === 99
      ? {
        ...value,
        result: {
          settled: true,
          resultTicket: "6-5-4",
          payoutPer100: 0
        }
      }
      : value
);
const invalidPayoutReport = reportApi.build(
  invalidPayoutRows
);
assert.equal(
  invalidPayoutReport.status,
  "awaiting-valid-official-result"
);
assert.equal(
  invalidPayoutReport.metrics.invalidResultCount,
  1,
  "払戻欠損の確定行を損失や中立として採点しない"
);
assert.equal(
  invalidPayoutReport.metrics.resolvedCount,
  99
);

const duplicate = {
  ...row(0, "loss"),
  selectedAt: "2026-08-13T00:00:30.000Z",
  practicalPriorityShadow: {
    ...row(0).practicalPriorityShadow,
    capturedAt: "2026-08-13T00:00:30.000Z"
  }
};
assert.equal(
  reportApi.build([row(0, "gain"), duplicate])
    .cohortCount,
  1,
  "同じraceKeyは一度だけ数える"
);

const wrongFingerprint = row(101, "gain");
wrongFingerprint.practicalPriorityShadow = {
  ...wrongFingerprint.practicalPriorityShadow,
  logicFingerprint: "changed-contract"
};
assert.equal(
  reportApi.build([wrongFingerprint]).cohortCount,
  0,
  "条件変更後の行を同じコホートへ混ぜない"
);

const wrongCohort = row(101, "gain");
wrongCohort.practicalPriorityShadow = {
  ...wrongCohort.practicalPriorityShadow,
  cohortContractFingerprint: "changed-cohort-contract"
};
assert.equal(
  reportApi.build([wrongCohort]).cohortCount,
  0,
  "判定条件が異なる行を同じコホートへ混ぜない"
);

const wrongSourceGeneration = row(101, "gain");
wrongSourceGeneration.practicalPriorityShadow = {
  ...wrongSourceGeneration.practicalPriorityShadow,
  sourceSelectionFingerprint:
    "evaluated-scenarios-v2|internal-score-v1|prioritygate-v6"
};
assert.equal(
  reportApi.build([wrongSourceGeneration]).cohortCount,
  0,
  "実戦厳選の世代が異なる行を同じコホートへ混ぜない"
);

const previousCourseGeneration = row(102, "gain");
previousCourseGeneration.practicalPriorityShadow = {
  ...previousCourseGeneration.practicalPriorityShadow,
  sourceSelectionFingerprint:
    "evaluated-scenarios-v1|internal-score-v1|practical-5-7-10-grounded-flow2-candidate90-strongescape-prioritygate-v5"
};
assert.equal(
  reportApi.build([previousCourseGeneration]).cohortCount,
  0,
  "進入fail-closed修正前の行を新しい固定100件コホートへ混ぜない"
);

const mixedGenerationRows = Array.from(
  { length: 100 },
  (_, index) => {
    const value = row(index, "neutral");
    if (index >= 50) {
      value.practicalPriorityShadow = {
        ...value.practicalPriorityShadow,
        sourceSelectionFingerprint:
          "evaluated-scenarios-v2|internal-score-v1|prioritygate-v6"
      };
    }
    return value;
  }
);
assert.equal(
  reportApi.build(mixedGenerationRows).cohortCount,
  50,
  "実戦厳選の異なる世代を固定100件へ混在させない"
);

const first = row(0, "neutral");
const sameMomentEarlierUtc = row(1, "neutral");
first.deadlineAt = "2026-08-13T09:00:00+09:00";
sameMomentEarlierUtc.deadlineAt = "2026-08-13T00:30:00+00:00";
first.practicalPriorityShadow = {
  ...first.practicalPriorityShadow,
  capturedAt: "2026-08-12T23:59:00.000Z"
};
sameMomentEarlierUtc.practicalPriorityShadow = {
  ...sameMomentEarlierUtc.practicalPriorityShadow,
  capturedAt: "2026-08-13T00:29:00.000Z"
};
assert.deepEqual(
  reportApi.eligibleRows([
    sameMomentEarlierUtc,
    first
  ]).map(value => value.raceKey),
  [first.raceKey, sameMomentEarlierUtc.raceKey],
  "時差表記ではなく実時刻で固定コホート順を決める"
);

const boundaryRows = Array.from(
  { length: 101 },
  (_, index) => row(index, "neutral")
).reverse();
const boundary = reportApi.build(boundaryRows);
assert.equal(boundary.cohortCount, 100);
assert.equal(boundary.samples.at(-1).raceKey, row(99).raceKey);
assert.ok(
  !boundary.samples.some(value =>
    value.raceKey === row(100).raceKey
  ),
  "101件目を固定100件へ入れない"
);

const late = row(102, "gain");
late.practicalPriorityShadow = {
  ...late.practicalPriorityShadow,
  capturedAt: late.deadlineAt
};
assert.equal(
  reportApi.build([late]).cohortCount,
  0,
  "締切以後のスナップショットを数えない"
);

const withoutCommit = row(103, "gain");
withoutCommit.practicalPriorityShadow = {
  ...withoutCommit.practicalPriorityShadow,
  sourceCommit: ""
};
assert.equal(
  reportApi.build([withoutCommit]).cohortCount,
  0,
  "生成コミット不明の行を数えない"
);

const selectedSource = {
  ...row(104, "neutral"),
  practicalPriorityShadow: null
};
const refreshedVerification = row(104, "gain");
assert.deepEqual(
  reportBuilder.rowsFromPredictionData({
    predictions: [selectedSource],
    verificationPredictions: [refreshedVerification]
  }),
  [selectedSource],
  "購入対象は後の検証行より実際に選定した締切前行を優先する"
);

const voidSource = row(5, "neutral");
voidSource.raceKey = "20260813-01-6";
voidSource.result = null;
const attachedVoid = reportBuilder.rowsFromPredictionData(
  { predictions: [voidSource] },
  {
    date: "20260813",
    races: [{
      date: "20260813",
      jcd: "01",
      raceNo: 6,
      status: "void",
      void: true,
      resultAvailable: false
    }]
  }
);
assert.equal(attachedVoid[0].result?.resolvedVoid, true);
assert.equal(attachedVoid[0].result?.void, true);

const officialSource = row(6, "neutral");
officialSource.raceKey = "20260813-01-7";
officialSource.result = {
  settled: false,
  resultTicket: "",
  payoutPer100: 0
};
const attachedOfficial = reportBuilder.rowsFromPredictionData(
  { predictions: [officialSource] },
  {
    date: "20260813",
    races: [{
      date: "20260813",
      jcd: "01",
      raceNo: 7,
      status: "finished",
      resultAvailable: true,
      trifecta: {
        combination: "1-3-6",
        payout: 1230,
        popularity: 8
      },
      finishers: [1, 3, 6],
      starts: [1, 2, 3, 4, 5, 6]
    }]
  }
);
assert.equal(attachedOfficial[0].result?.settled, true);
assert.equal(attachedOfficial[0].result?.resultTicket, "1-3-6");
assert.equal(attachedOfficial[0].result?.payoutPer100, 1230);
assert.equal(attachedOfficial[0].result?.popularity, 8);

console.log(
  "practical priority prospective shadow report: OK"
);
