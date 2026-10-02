"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const inputFreeze = require("../config/effective-score-weight-ab-input-freeze-v1.json");
const config = require("../config/effective-score-weight-ab-v1.json");
const report = require("../data/stats/effective-score-weight-ab-report.json");
const weightAb = require("../js/effective-score-weight-ab");
const reportBuilder = require("./build-effective-score-weight-ab-report");

function clone(value) {
  return structuredClone(value);
}

function filesRecursively(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.isDirectory() && [".git", "node_modules"].includes(entry.name)) {
      return [];
    }
    const absolutePath = path.join(directory, entry.name);
    return entry.isDirectory() ? filesRecursively(absolutePath) : [absolutePath];
  });
}

function analysis(boatNo, overrides = {}) {
  const indexes = {
    raceFlow: 80,
    st: 50,
    exhibition: 40,
    motor: 0,
    local: 10,
    national: 100,
    turn: 90,
    total: 59.8,
    ...overrides.indexes
  };
  return {
    boatNo,
    indexes,
    roleScores: {
      attack: 60,
      hold: 30,
      pickup: 20,
      ...overrides.roleScores
    },
    courseStructureTheory: {
      appliedIndex: 70,
      ...overrides.courseStructureTheory
    }
  };
}

function syntheticPairedRow(index, aRank, bRank, options = {}) {
  const aTop1 = aRank === 1;
  const bTop1 = bRank === 1;
  return {
    raceKey: `2026081${index}-01-${index}`,
    date: `2026081${index}`,
    selectedAt: `2026-08-1${index}T00:00:00Z`,
    candidateId: options.candidateId || "p1-flow-shift-100bp",
    l1DistanceFromBaseline: options.distance ?? 0.02,
    winnerBoatNo: 1,
    finishOrder: [1, 2, 3, 4, 5, 6],
    top1Outcome: aTop1 && bTop1 ? "both" : aTop1 ? "a-only" : bTop1 ? "b-only" : "neither",
    a: {
      profileId: "p0-current",
      topBoatNo: aTop1 ? 1 : 2,
      top1Win: aTop1,
      winnerTop3: aRank <= 3,
      winnerRank: aRank,
      pairwiseFinishOrder: {
        concordant: options.aConcordant ?? 10,
        comparable: 15,
        rate: (options.aConcordant ?? 10) / 15
      },
      ranking: options.aRanking || [1, 2, 3, 4, 5, 6].map((boatNo, rank) => ({ boatNo, rank: rank + 1 }))
    },
    b: {
      profileId: options.candidateId || "p1-flow-shift-100bp",
      topBoatNo: bTop1 ? 1 : 2,
      top1Win: bTop1,
      winnerTop3: bRank <= 3,
      winnerRank: bRank,
      pairwiseFinishOrder: {
        concordant: options.bConcordant ?? 11,
        comparable: 15,
        rate: (options.bConcordant ?? 11) / 15
      },
      ranking: options.bRanking || [1, 2, 3, 4, 5, 6].map((boatNo, rank) => ({ boatNo, rank: rank + 1 }))
    }
  };
}

assert.equal(weightAb.VERSION, "effective-score-weight-ab-v1");
assert.equal(report.preregistration.commit, reportBuilder.PREREGISTRATION_COMMIT);
assert.equal(report.preregistration.sourceCommit, config.sourceCommit);
assert.equal(report.inputFreeze.commit, reportBuilder.INPUT_FREEZE_COMMIT);
assert.equal(report.inputFreeze.status, inputFreeze.status);
assert.equal(report.fingerprints.config, weightAb.configFingerprint(config));
const frozenCohortActual = {
  replayBasisRaceCount: report.cohort.replayBasis.raceCount,
  replayBasisBoatCount: report.cohort.replayBasis.boatCount,
  settledEvaluationRaceCount: report.cohort.settled.raceCount,
  replayBasisCohortFingerprint: report.fingerprints.replayBasisCohort,
  settledEvaluationCohortFingerprint:
    report.fingerprints.settledEvaluationCohort
};
assert.deepEqual(
  reportBuilder.validateInputFreeze(config, inputFreeze, frozenCohortActual),
  frozenCohortActual
);
const tamperedInputFreeze = clone(inputFreeze);
tamperedInputFreeze.expected.replayBasisCohortFingerprint =
  "sha256:0000000000000000000000000000000000000000000000000000000000000000";
assert.throws(
  () => reportBuilder.validateInputFreeze(
    config,
    tamperedInputFreeze,
    frozenCohortActual
  ),
  /replayBasisCohortFingerprint changed/
);
assert.deepEqual(report.evaluationProtocol.pairwise.discovery, {
  comparablePairCount: 774,
  exact: true
});
assert.deepEqual(report.evaluationProtocol.pairwise.holdout, {
  expectedComparablePairCount: 579,
  evaluatedComparablePairCount: null,
  exact: null,
  status: "not-evaluated-sealed"
});
const repositoryRoot = path.resolve(__dirname, "..");
const analysisModulePath = path.join(repositoryRoot, "js", "effective-score-weight-ab.js");
const runtimeReferenceFiles = [
  ...filesRecursively(path.join(repositoryRoot, "js")).filter(file => file.endsWith(".js")),
  ...filesRecursively(repositoryRoot).filter(file => file.endsWith(".html"))
].filter(file => file !== analysisModulePath);
const forbiddenRuntimeReferences = runtimeReferenceFiles
  .filter(file => fs.readFileSync(file, "utf8").includes("effective-score-weight-ab"))
  .map(file => path.relative(repositoryRoot, file));
assert.deepEqual(
  forbiddenRuntimeReferences,
  [],
  "shadow-only module must not be referenced by production JS or HTML"
);
assert.deepEqual(weightAb.COMPONENT_ORDER, config.target.componentOrder);
assert.deepEqual(weightAb.RANKING_TIE_BREAK, config.target.rankingTieBreak);
assert.deepEqual(weightAb.DIRECT_COEFFICIENT_ORDER, [
  "raceFlow",
  "courseIndex",
  "roleAttack",
  "st",
  "exhibition",
  "roleHold",
  "local",
  "rolePickup",
  "turn",
  "national",
  "motor"
]);
assert.equal(weightAb.validateConfig(config), config);

const baseline = weightAb.baselineProfile(config);
assert.equal(baseline.id, "p0-current");
assert.equal(weightAb.profileById(config, "p3-coupled-start-attack-shift-100bp").kind, "candidate");
assert.throws(() => weightAb.profileById(config, "missing"), /見つかりません/);

for (const profile of config.profiles) {
  for (let index = 0; index < weightAb.DIRECT_COEFFICIENT_ORDER.length - 1; index += 1) {
    const left = weightAb.DIRECT_COEFFICIENT_ORDER[index];
    const right = weightAb.DIRECT_COEFFICIENT_ORDER[index + 1];
    assert(profile.weights[left] > profile.weights[right], `${profile.id}: ${left}>${right}`);
  }
}

const badSum = clone(config);
badSum.profiles[1].weights.raceFlow += 0.001;
assert.throws(() => weightAb.validateConfig(badSum), /weight合計/);

const badFinite = clone(config);
badFinite.profiles[1].weights.motor = Number.NaN;
assert.throws(() => weightAb.validateConfig(badFinite), /有限数/);

const badNegative = clone(config);
badNegative.profiles[1].weights.motor = -0.001;
badNegative.profiles[1].weights.raceFlow += 0.006;
assert.throws(() => weightAb.validateConfig(badNegative), /0以上/);

const badExhibition = clone(config);
badExhibition.profiles[1].weights.exhibition = 0.095;
badExhibition.profiles[1].weights.national -= 0.005;
assert.throws(() => weightAb.validateConfig(badExhibition), /展示weight/);

const badMotorMaximum = clone(config);
badMotorMaximum.constraints.motorWeightMaximum = 0.004;
assert.throws(() => weightAb.validateConfig(badMotorMaximum), /motor weight/);

const badMaximumDelta = clone(config);
badMaximumDelta.profiles[1].weights.raceFlow = 0.261;
badMaximumDelta.profiles[1].weights.courseIndex = 0.234;
assert.throws(() => weightAb.validateConfig(badMaximumDelta), /baseline差/);

const badDirectOrder = clone(config);
badDirectOrder.profiles[1].weights.local = 0.04;
badDirectOrder.profiles[1].weights.rolePickup = 0.04;
assert.throws(() => weightAb.validateConfig(badDirectOrder), /直接係数順/);

const badBaselineDirectOrder = clone(config);
badBaselineDirectOrder.profiles[0].weights.local = 0.04;
badBaselineDirectOrder.profiles[0].weights.rolePickup = 0.04;
assert.throws(() => weightAb.validateConfig(badBaselineDirectOrder), /直接係数順/);

const badSafety = clone(config);
badSafety.safety.runtimeImportAllowed = true;
assert.throws(() => weightAb.validateConfig(badSafety), /runtimeImportAllowed/);

const badDownstreamClaim = clone(config);
badDownstreamClaim.safety.downstreamScenarioMarksTicketsClaimAllowed = true;
assert.throws(() => weightAb.validateConfig(badDownstreamClaim), /効果主張/);

const badTemporalSplit = clone(config);
badTemporalSplit.cohort.discoveryDates[
  badTemporalSplit.cohort.discoveryDates.length - 1
] = "20260820";
assert.throws(
  () => weightAb.validateConfig(badTemporalSplit),
  /holdoutより前の時系列期間/
);

const identityFixture = analysis(1, {
  indexes: { courseIndex: 999 }
});
const identityScore = weightAb.scoreAnalysis(identityFixture, baseline, config);
assert.equal(identityScore.total, identityFixture.indexes.total, "current profileは保存済みproduction totalを再現する");
assert.equal(identityScore.components.courseIndex, 70, "courseIndexはlegacy offset込みappliedIndexを使う");
assert.notEqual(identityScore.components.courseIndex, identityFixture.indexes.courseIndex, "indexes上の別名へfallbackしない");

const p3 = weightAb.profileById(config, "p3-coupled-start-attack-shift-100bp");
const p3Score = weightAb.scoreAnalysis(identityFixture, p3, config);
const expectedP3Delta =
  identityScore.components.roleAttack * 0.005 +
  identityScore.components.st * 0.005 -
  identityScore.components.roleHold * 0.005 -
  identityScore.components.national * 0.005;
assert.ok(
  Math.abs((p3Score.rawTotal - identityScore.rawTotal) - expectedP3Delta) < 1e-9,
  "P3はST直接項とroleAttack合成済み項をcoupledで動かす"
);

const missingCourse = analysis(1);
delete missingCourse.courseStructureTheory.appliedIndex;
assert.throws(
  () => weightAb.scoreAnalysis(missingCourse, baseline, config),
  /courseStructureTheory\.appliedIndex/
);

const high = analysis(1, {
  indexes: {
    raceFlow: 1000,
    st: 1000,
    exhibition: 1000,
    motor: 1000,
    local: 1000,
    national: 1000,
    turn: 1000
  },
  roleScores: { attack: 1000, hold: 1000, pickup: 1000 },
  courseStructureTheory: { appliedIndex: 1000 }
});
const low = analysis(2, {
  indexes: {
    raceFlow: -1000,
    st: -1000,
    exhibition: -1000,
    motor: -1000,
    local: -1000,
    national: -1000,
    turn: -1000
  },
  roleScores: { attack: -1000, hold: -1000, pickup: -1000 },
  courseStructureTheory: { appliedIndex: -1000 }
});
assert.equal(weightAb.scoreAnalysis(high, baseline, config).total, 100, "score上限を100へclampする");
assert.equal(weightAb.scoreAnalysis(low, baseline, config).total, 1, "score下限を1へclampする");

const tiedRanking = weightAb.rankAnalyses([3, 2, 1, 6, 5, 4].map(boatNo =>
  analysis(boatNo, {
    indexes: { raceFlow: 50, st: 50, exhibition: 50, motor: 50, local: 50, national: 50, turn: 50 },
    roleScores: { attack: boatNo === 2 ? 50.1 : 50, hold: 50, pickup: 50 },
    courseStructureTheory: { appliedIndex: 50 }
  })
), baseline, config);
assert.deepEqual(tiedRanking.map(row => row.total), [50, 50, 50, 50, 50, 50], "0.1丸め後のtotalで順位比較する");
assert.deepEqual(tiedRanking.map(row => row.boatNo), [2, 1, 3, 4, 5, 6], "total→roleAttack→boatNoでtie-breakする");
assert.throws(
  () => weightAb.rankAnalyses([analysis(1)], baseline, config),
  /6艇exact/
);

const raceAnalyses = [
  analysis(1),
  analysis(2, { indexes: { raceFlow: 79 } }),
  analysis(3, { indexes: { raceFlow: 78 } }),
  analysis(4, { indexes: { raceFlow: 77 } }),
  analysis(5, { indexes: { raceFlow: 76 } }),
  analysis(6, { indexes: { raceFlow: 75 } })
];
const comparedRace = weightAb.compareRace({
  raceKey: "20260815-01-1",
  date: "20260815",
  selectedAt: "2026-08-15T00:00:00Z",
  analyses: raceAnalyses,
  winnerBoatNo: 1,
  finishOrder: [1, 2, 3, 4, 5, 6]
}, "p1-flow-shift-100bp", config);
assert.equal(comparedRace.a.ranking.length, 6);
assert.equal(comparedRace.b.ranking.length, 6);
assert.equal(comparedRace.a.pairwiseFinishOrder.comparable, 15);
assert.equal(comparedRace.b.pairwiseFinishOrder.comparable, 15);
assert.equal(comparedRace.top1Outcome, "both");

// 正式experimentの公式結果契約は上位3艇だけなので、pairwise母数は3組に固定される。
const formalTop3ComparedRace = weightAb.compareRace({
  raceKey: "20260815-01-1",
  date: "20260815",
  selectedAt: "2026-08-15T00:00:00Z",
  analyses: raceAnalyses,
  winnerBoatNo: 1,
  finishOrder: [1, 2, 3]
}, "p1-flow-shift-100bp", config);
assert.equal(formalTop3ComparedRace.a.pairwiseFinishOrder.comparable, 3);
assert.equal(formalTop3ComparedRace.b.pairwiseFinishOrder.comparable, 3);

assert.deepEqual(
  weightAb.finishOrderConcordance([
    { boatNo: 2, rank: 1 },
    { boatNo: 1, rank: 2 },
    { boatNo: 3, rank: 3 }
  ], [1, 2, 3]),
  { concordant: 2, comparable: 3, rate: 2 / 3 }
);
assert.deepEqual(
  weightAb.finishOrderConcordance([{ boatNo: 1, rank: 1 }], [1]),
  { concordant: 0, comparable: 0, rate: null }
);

assert.equal(weightAb.oneSidedExactBinomial(0, 0), 1);
assert.equal(weightAb.oneSidedExactBinomial(0, 5), 0.03125);
assert.equal(weightAb.oneSidedExactBinomial(1, 4), 0.1875);
assert.equal(weightAb.oneSidedExactBinomial(5, 0), 1);
assert.throws(() => weightAb.oneSidedExactBinomial(-1, 2), /aOnly/);

const pairedRows = [
  syntheticPairedRow(1, 2, 1),
  syntheticPairedRow(2, 1, 2),
  syntheticPairedRow(3, 1, 1),
  syntheticPairedRow(4, 4, 3),
  syntheticPairedRow(5, 3, 2),
  syntheticPairedRow(6, 2, 1)
];
const summary = weightAb.summarizePaired(pairedRows);
assert.equal(summary.raceCount, 6);
assert.equal(summary.bothTop1Wins, 1);
assert.equal(summary.aOnlyTop1Wins, 1);
assert.equal(summary.bOnlyTop1Wins, 2);
assert.equal(summary.neitherTop1Wins, 2);
assert.equal(summary.netTop1Wins, 1);
assert.equal(summary.oneSidedExactPValue, 0.5);
assert.equal(summary.winnerTop3Delta, 1);
assert.equal(summary.meanWinnerRankDelta, -0.5);
assert.equal(summary.pairwiseFinishOrderComparable, 90);
assert.ok(Math.abs(summary.pairwiseFinishOrderConcordanceDelta - 1 / 15) < 1e-12);
assert.deepEqual(summary.chronologicalHalves.map(half => half.raceCount), [3, 3]);
assert.deepEqual(summary.chronologicalHalves.map(half => half.netTop1Wins), [0, 1]);
assert.equal(weightAb.discoveryEligibility(summary, config).eligible, true);
assert.deepEqual(
  weightAb.chronologicalHalves(pairedRows.slice(0, 5)).map(half => half.rows.length),
  [2, 3],
  "奇数cohortはfloor位置で前半/後半を分ける"
);

const ineligibleSummary = clone(summary);
ineligibleSummary.candidateId = "p2-course-shift-50bp";
ineligibleSummary.l1DistanceFromBaseline = 0.01;
ineligibleSummary.netTop1Wins = 0;
assert.equal(weightAb.discoveryEligibility(ineligibleSummary, config).eligible, false);
assert.deepEqual(
  weightAb.discoveryEligibility(ineligibleSummary, config).reasons,
  ["positiveNetTop1Wins"]
);

function candidateSummary(candidateId, values = {}) {
  return {
    ...summary,
    candidateId,
    l1DistanceFromBaseline: values.distance ?? 0.02,
    netTop1Wins: values.net ?? 2,
    pairwiseFinishOrderConcordanceDelta: values.pairwise ?? 0.1,
    winnerTop3Delta: values.top3 ?? 1,
    meanWinnerRankDelta: values.meanRank ?? -0.1,
    chronologicalHalves: [
      { ...summary.chronologicalHalves[0], netTop1Wins: values.firstHalfNet ?? 1 },
      { ...summary.chronologicalHalves[1], netTop1Wins: values.secondHalfNet ?? 1 }
    ]
  };
}

const selection = weightAb.selectDiscoveryCandidate([
  { candidateId: "p1-flow-shift-100bp", summary: candidateSummary("p1-flow-shift-100bp", { pairwise: 0.1 }) },
  { candidateId: "p2-course-shift-50bp", summary: candidateSummary("p2-course-shift-50bp", { pairwise: 0.2, distance: 0.01 }) },
  { candidateId: "p3-coupled-start-attack-shift-100bp", summary: candidateSummary("p3-coupled-start-attack-shift-100bp", { net: 1, pairwise: 0.3 }) }
], config);
assert.equal(selection.selectedCandidateId, "p2-course-shift-50bp", "事前登録tie-breakを順番通り適用する");
assert.deepEqual(selection.eligibleCandidateIds, [
  "p2-course-shift-50bp",
  "p1-flow-shift-100bp",
  "p3-coupled-start-attack-shift-100bp"
]);
assert.equal(selection.evaluations.length, 3);

const distanceTie = weightAb.selectDiscoveryCandidate([
  candidateSummary("p1-flow-shift-100bp", { pairwise: 0.2, top3: 1, distance: 0.02 }),
  candidateSummary("p2-course-shift-50bp", { pairwise: 0.2, top3: 1, distance: 0.01 })
], config);
assert.equal(distanceTie.selectedCandidateId, "p2-course-shift-50bp", "L1距離が小さい候補を優先する");

const idTie = weightAb.selectDiscoveryCandidate([
  candidateSummary("p3-coupled-start-attack-shift-100bp"),
  candidateSummary("p1-flow-shift-100bp")
], config);
assert.equal(idTie.selectedCandidateId, "p1-flow-shift-100bp", "最終tie-breakはcandidateId昇順にする");

const noSelection = weightAb.selectDiscoveryCandidate([
  candidateSummary("p1-flow-shift-100bp", { net: 0 })
], config);
assert.equal(noSelection.selectedCandidateId, null);
assert.equal(noSelection.selectedCandidate, null);

const passingHoldout = candidateSummary("p1-flow-shift-100bp", {
  net: 6,
  firstHalfNet: 3,
  secondHalfNet: 3,
  top3: 0,
  meanRank: 0
});
passingHoldout.aOnlyTop1Wins = 0;
passingHoldout.bOnlyTop1Wins = 6;
passingHoldout.oneSidedExactPValue = weightAb.oneSidedExactBinomial(0, 6);
passingHoldout.chronologicalHalves = passingHoldout.chronologicalHalves.map(half => ({
  ...half,
  winnerTop3Delta: 0
}));
const holdoutGate = weightAb.evaluateSealedHoldout(passingHoldout, config);
assert.equal(holdoutGate.passed, true);
assert.equal(holdoutGate.decision, "review-candidate-score-only");

const failingHoldout = clone(passingHoldout);
failingHoldout.oneSidedExactPValue = 0.0500001;
assert.equal(weightAb.evaluateSealedHoldout(failingHoldout, config).passed, false);
assert.ok(weightAb.evaluateSealedHoldout(failingHoldout, config).reasons.includes("exactPValue"));

const canonicalLeft = { z: 1, nested: { b: 2, a: 1 } };
const canonicalRight = { nested: { a: 1, b: 2 }, z: 1 };
assert.equal(weightAb.fingerprint(canonicalLeft), weightAb.fingerprint(canonicalRight));
assert.match(weightAb.configFingerprint(config), /^sha256:[0-9a-f]{64}$/);
assert.match(weightAb.formulaFingerprint(config, baseline), /^sha256:[0-9a-f]{64}$/);
assert.notEqual(
  weightAb.formulaFingerprint(config, baseline),
  weightAb.formulaFingerprint(config, "p1-flow-shift-100bp")
);
assert.equal(
  weightAb.cohortFingerprint(pairedRows),
  weightAb.cohortFingerprint([...pairedRows].reverse()),
  "cohort fingerprintは入力配列順に依存しない"
);
const changedRows = clone(pairedRows);
changedRows[0].winnerBoatNo = 6;
assert.notEqual(
  weightAb.cohortFingerprint(pairedRows),
  weightAb.cohortFingerprint(changedRows),
  "cohort内容変更はfingerprintを変える"
);

console.log("effective-score-weight-ab tests passed");
