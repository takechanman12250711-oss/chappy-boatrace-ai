"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const analysisConfig = require("../config/effective-score-miss-attribution-v1.json");
const weightConfig = require("../config/effective-score-weight-ab-v1.json");
const savedReport = require("../data/stats/effective-score-miss-attribution-report.json");
const scoreAb = require("../js/effective-score-weight-ab");
const reportBuilder = require("./build-effective-score-miss-attribution-report");

const ROOT = path.resolve(__dirname, "..");

function filesRecursively(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.isDirectory() && [".git", "node_modules"].includes(entry.name)) {
      return [];
    }
    const absolutePath = path.join(directory, entry.name);
    return entry.isDirectory() ? filesRecursively(absolutePath) : [absolutePath];
  });
}

function analysis(boatNo, courseIndex, raceFlow, roleAttack) {
  return {
    boatNo,
    indexes: {
      raceFlow,
      st: 40 + boatNo,
      exhibition: 50 + boatNo,
      motor: 30 + boatNo,
      local: 60 - boatNo,
      national: 55 + boatNo,
      turn: 45 + boatNo,
      total: 50
    },
    roleScores: {
      attack: roleAttack,
      hold: 30 + boatNo,
      pickup: 20 + boatNo
    },
    courseStructureTheory: {
      appliedIndex: courseIndex
    }
  };
}

const originalReadFileSync = fs.readFileSync;
fs.readFileSync = function guardedReadFileSync(filePath, ...args) {
  const printablePath = Buffer.isBuffer(filePath)
    ? filePath.toString("utf8")
    : String(filePath);
  const normalizedPath = printablePath.replaceAll("\\", "/");
  const isEvaluationInput =
    normalizedPath.includes("/data/predictions/") ||
    normalizedPath.includes("/data/results/");
  const isForbiddenDate = analysisConfig.cohort.forbiddenHoldoutDates
    .some(date => normalizedPath.endsWith(`/${date}.json`));
  if (isEvaluationInput && isForbiddenDate) {
    throw new Error(`forbidden holdout input read: ${normalizedPath}`);
  }
  return originalReadFileSync.call(this, filePath, ...args);
};

let builtReport;
try {
  builtReport = reportBuilder.buildReport();
} finally {
  fs.readFileSync = originalReadFileSync;
}

assert.deepEqual(
  builtReport,
  savedReport,
  "saved discovery-only report must equal a fresh guarded build"
);

assert.deepEqual(savedReport.cohort, {
  scope: "discovery-only",
  dates: ["20260815", "20260816", "20260817", "20260818"],
  replayRaceCount: 258,
  replayBoatCount: 1548,
  settledRaceCount: 258,
  baselineTop1HitCount: 124,
  baselineTop1MissCount: 134,
  chronologicalHalfRaceCounts: [129, 129],
  chronologicalHalfMissCounts: [63, 71],
  holdoutDatesForbidden: ["20260819", "20260823", "20260827", "20260828"],
  holdoutResultsRead: false,
  holdoutEvaluated: false
});
assert.deepEqual(savedReport.fingerprints, {
  replay: "sha256:4e03373df68a08e785af3e290903cd8805fc8e644bc23b6f0de0331c4ef9e986",
  settled: "sha256:5ebd791376e068b69aa1314aa8b3beea8096caf183b03404861f6f66846ee444",
  missSubset: "sha256:25ec72f68700c1ba8c9a0a765db024389bb528d2ab5e3da343efc8187ba6c422",
  analysisConfig: scoreAb.fingerprint(analysisConfig)
});

assert.equal(savedReport.definition.label, "discovery top-1 score miss");
assert.equal(savedReport.definition.notTicketMiss, true);
assert.equal(savedReport.definition.causalClaim, false);
assert.equal(savedReport.baselineIdentity.scope, "discovery-only");
assert.equal(savedReport.baselineIdentity.exact, true);
assert.equal(savedReport.baselineIdentity.scoreIdentity, "1548/1548");
assert.deepEqual(savedReport.attribution.winnerRankCounts, {
  2: 42,
  3: 38,
  4: 24,
  5: 23,
  6: 7
});
assert.deepEqual(savedReport.attribution.strongestBaselineTopAdvantage, {
  courseIndex: 119,
  raceFlow: 15
});
assert.equal(
  Object.values(savedReport.attribution.strongestBaselineTopAdvantage)
    .reduce((sum, count) => sum + count, 0),
  134
);
assert.equal(
  Object.values(savedReport.attribution.strongestOfficialWinnerAdvantage)
    .reduce((sum, count) => sum + count, 0) +
      savedReport.attribution.noObservedOfficialWinnerAdvantageCount,
  134
);
assert.equal(savedReport.attribution.accountingExact, true);
assert.deepEqual(savedReport.attribution.structuralVsWeightAssessment, {
  result:
    "descriptive-inner-course-pattern-dominant-local-weight-tuning-unsupported",
  structuralDiagnosticComponents: ["courseIndex", "raceFlow", "roleHold"],
  structuralDiagnosticMeanWeightedDeficit: 15.639783582,
  shareOfMeanRawGap: 0.994588169,
  priorLocalWeightProfilesRecoveringAnyBaselineMiss: 0,
  causalClaim: false
});
assert.deepEqual(savedReport.attribution.courseIndexRange, {
  belowMinimumBoatCount: 218,
  aboveMaximumBoatCount: 258,
  raceCountWithAnyOutOfRange: 258,
  outOfRangeBoatCount: 476
});

assert.deepEqual(savedReport.priorWeightNeighborhoodSanity, {
  generation: {
    orderedReceiverDonorPairs: true,
    deltaMinimum: 0.001,
    deltaMaximum: 0.01,
    deltaStep: 0.001,
    existingWeightConstraintsApplied: true
  },
  validProfileCount: 618,
  recoveredBaselineMissUnionCount: 0,
  maximumAddedTop1: 0,
  maximumNetTop1: 0,
  retrospectiveUnpreregistered: true
});

const naturalClamp = savedReport.courseSensitivity.naturalOneToOneHundredClamp;
assert.equal(naturalClamp.status, "retrospective-rejected");
assert.deepEqual(
  {
    top1: naturalClamp.all.top1,
    added: naturalClamp.all.added,
    lost: naturalClamp.all.lost,
    netTop1: naturalClamp.all.netTop1,
    halfNetTop1: naturalClamp.chronologicalHalves.map(half => half.netTop1)
  },
  { top1: 109, added: 14, lost: 29, netTop1: -15, halfNetTop1: [-15, 0] }
);

const hypothesis = savedReport.courseSensitivity.exploratoryHypothesis;
assert.equal(hypothesis.factor, 0.9);
assert.equal(hypothesis.evidenceStrength, "weak");
assert.equal(hypothesis.approved, false);
assert.equal(hypothesis.usableForPrediction, false);
assert.deepEqual(
  {
    baselineTop1: hypothesis.measuredRetrospectiveImpact.baseline.top1,
    candidateTop1: hypothesis.measuredRetrospectiveImpact.candidate.top1,
    added: hypothesis.measuredRetrospectiveImpact.candidate.added,
    lost: hypothesis.measuredRetrospectiveImpact.candidate.lost,
    netTop1: hypothesis.measuredRetrospectiveImpact.candidate.netTop1,
    top3: hypothesis.measuredRetrospectiveImpact.candidate.top3,
    meanWinnerRank:
      hypothesis.measuredRetrospectiveImpact.candidate.meanWinnerRank,
    pairwiseConcordant:
      hypothesis.measuredRetrospectiveImpact.candidate
        .pairwiseFinishOrder.concordant,
    oneSidedExactPValue:
      hypothesis.measuredRetrospectiveImpact.oneSidedExactPValue,
    halfNetTop1:
      hypothesis.measuredRetrospectiveImpact.chronologicalHalves
        .map(half => half.netTop1)
  },
  {
    baselineTop1: 124,
    candidateTop1: 125,
    added: 2,
    lost: 1,
    netTop1: 1,
    top3: 206,
    meanWinnerRank: 2.213178295,
    pairwiseConcordant: 524,
    oneSidedExactPValue: 0.5,
    halfNetTop1: [0, 1]
  }
);
assert.deepEqual(savedReport.courseSensitivity.formalProposalEligibility, {
  eligible: false,
  decision: "no-supported-change-proposal",
  reasons: [
    "retrospective-multiple-profile-search",
    "one-sided-exact-p-value-0.5",
    "no-positive-first-half-selection-candidate"
  ],
  firstHalfPositiveNetFactors: []
});
assert.equal(savedReport.decision.result, "no-supported-change-proposal");
assert.equal(savedReport.decision.productionChangeAllowed, false);

for (const key of [
  "productionChanged",
  "runtimeImportAllowed",
  "automaticApplication",
  "proposalApproved",
  "usableForPrediction",
  "holdoutResultsRead",
  "holdoutEvaluated",
  "downstreamScenarioMarksTicketsSupported",
  "newEnvironmentSupported"
]) {
  assert.equal(savedReport.safety[key], false, `safety.${key} must remain false`);
}

const runtimeFiles = [
  ...filesRecursively(path.join(ROOT, "js")).filter(file => file.endsWith(".js")),
  ...filesRecursively(ROOT).filter(file => file.endsWith(".html"))
];
const runtimeReferences = runtimeFiles
  .filter(file => originalReadFileSync(file, "utf8")
    .includes("effective-score-miss-attribution"))
  .map(file => path.relative(ROOT, file));
assert.deepEqual(
  runtimeReferences,
  [],
  "retrospective miss attribution must not be referenced by runtime JS or HTML"
);

const fixture = [
  analysis(1, 120, 90, 70),
  analysis(2, 105, 80, 65),
  analysis(3, 90, 75, 60),
  analysis(4, 75, 70, 55),
  analysis(5, 60, 65, 50),
  analysis(6, 45, 60, 45)
];
const baseline = scoreAb.baselineProfile(weightConfig);
const productionRanking = scoreAb.rankAnalyses(fixture, baseline, weightConfig);
const factorOneRanking = reportBuilder.rankAnalyses(
  fixture,
  weightConfig,
  baseline.weights,
  { courseSpreadFactor: 1 }
);
assert.deepEqual(
  factorOneRanking.map(row => ({ boatNo: row.boatNo, total: row.total })),
  productionRanking.map(row => ({ boatNo: row.boatNo, total: row.total }))
);
assert.throws(
  () => reportBuilder.rankAnalyses(
    fixture,
    weightConfig,
    baseline.weights,
    { courseSpreadFactor: 0 }
  ),
  /course spread factor/
);
assert.throws(
  () => reportBuilder.rankAnalyses(
    fixture,
    weightConfig,
    baseline.weights,
    { courseSpreadFactor: 1.01 }
  ),
  /course spread factor/
);

console.log("effective score miss-attribution checks passed");
