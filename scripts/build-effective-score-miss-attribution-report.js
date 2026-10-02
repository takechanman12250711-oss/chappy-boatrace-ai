"use strict";

const fs = require("node:fs");
const path = require("node:path");

const scoreAb = require("../js/effective-score-weight-ab");
const weightReport = require("./build-effective-score-weight-ab-report");

const ROOT = path.resolve(__dirname, "..");
const ANALYSIS_CONFIG_PATH = path.join(
  ROOT,
  "config",
  "effective-score-miss-attribution-v1.json"
);
const WEIGHT_CONFIG_PATH = path.join(
  ROOT,
  "config",
  "effective-score-weight-ab-v1.json"
);
const REPORT_PATH = path.join(
  ROOT,
  "data",
  "stats",
  "effective-score-miss-attribution-report.json"
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function rounded(value, digits = 9) {
  if (!Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function scoreRound(value, digits = 1) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function compareRows(left, right) {
  return String(left.date).localeCompare(String(right.date)) ||
    String(left.selectedAt).localeCompare(String(right.selectedAt)) ||
    String(left.raceKey).localeCompare(String(right.raceKey));
}

function settledFingerprintRows(rows) {
  return rows.map(row => ({
    raceKey: row.raceKey,
    date: row.date,
    selectedAt: row.selectedAt,
    finishOrder: row.finishOrder,
    analyses: row.analyses
  }));
}

function loadDiscovery(options = {}) {
  const root = options.root || ROOT;
  const analysisConfig = options.analysisConfig || readJson(
    options.analysisConfigPath ||
      path.join(root, "config", "effective-score-miss-attribution-v1.json")
  );
  const weightConfig = scoreAb.validateConfig(
    options.weightConfig || readJson(
      options.weightConfigPath ||
        path.join(root, "config", "effective-score-weight-ab-v1.json")
    )
  );
  const dates = analysisConfig.cohort.discoveryDates;
  assert(
    JSON.stringify(dates) === JSON.stringify(weightConfig.cohort.discoveryDates),
    "miss attribution discovery dates do not match the frozen weight experiment"
  );

  const replay = weightReport.collectReplayBasisCohort({
    root,
    config: weightConfig,
    predictionsDir: options.predictionsDir,
    allowedDates: dates
  });
  const discoveryOnlyConfig = structuredClone(weightConfig);
  discoveryOnlyConfig.cohort.holdoutDates = [];
  const settled = weightReport.joinOfficialResults(replay.rows, {
    root,
    config: discoveryOnlyConfig,
    resultsDir: options.resultsDir
  });
  replay.rows.sort(compareRows);
  settled.rows.sort(compareRows);
  return { analysisConfig, weightConfig, replay, settled };
}

function rankAnalyses(analyses, weightConfig, weights, options = {}) {
  const components = analyses.map(scoreAb.componentsFromAnalysis);
  const courseMean = components.reduce(
    (sum, row) => sum + row.courseIndex,
    0
  ) / components.length;
  const factor = Number(options.courseSpreadFactor ?? 1);
  assert(Number.isFinite(factor) && factor > 0 && factor <= 1, "course spread factor must be in (0, 1]");

  return analyses.map((analysis, index) => {
    const row = { ...components[index] };
    row.courseIndex = options.naturalCourseClamp === true
      ? clamp(
        row.courseIndex,
        weightConfig.target.minimumScore,
        weightConfig.target.maximumScore
      )
      : courseMean + factor * (row.courseIndex - courseMean);
    const rawTotal = scoreAb.COMPONENT_ORDER.reduce(
      (sum, key) => sum + row[key] * weights[key],
      0
    );
    const total = clamp(
      scoreRound(rawTotal, weightConfig.target.roundDigits),
      weightConfig.target.minimumScore,
      weightConfig.target.maximumScore
    );
    return {
      boatNo: Number(analysis.boatNo),
      rawTotal,
      total,
      roleAttack: row.roleAttack,
      components: row
    };
  }).sort((left, right) =>
    right.total - left.total ||
    right.roleAttack - left.roleAttack ||
    left.boatNo - right.boatNo
  ).map((row, index) => ({ ...row, rank: index + 1 }));
}

function pairedSummary(rows, weightConfig, options = {}) {
  const baseline = scoreAb.baselineProfile(weightConfig);
  let top1 = 0;
  let top3 = 0;
  let winnerRankSum = 0;
  let pairwiseConcordant = 0;
  let pairwiseComparable = 0;
  let rankingChanged = 0;
  let topBoatChanged = 0;
  let added = 0;
  let lost = 0;
  const addedRaceKeys = [];
  const lostRaceKeys = [];
  const topBoatDistribution = {};

  for (const row of rows) {
    const a = scoreAb.rankAnalyses(row.analyses, baseline, weightConfig);
    const b = rankAnalyses(
      row.analyses,
      weightConfig,
      options.weights || baseline.weights,
      options
    );
    const aWin = a[0].boatNo === row.winnerBoatNo;
    const bWin = b[0].boatNo === row.winnerBoatNo;
    const winner = b.find(item => item.boatNo === row.winnerBoatNo);
    if (bWin) top1 += 1;
    if (winner.rank <= 3) top3 += 1;
    winnerRankSum += winner.rank;
    const pairwise = scoreAb.finishOrderConcordance(b, row.finishOrder);
    pairwiseConcordant += pairwise.concordant;
    pairwiseComparable += pairwise.comparable;
    if (a.map(item => item.boatNo).join() !== b.map(item => item.boatNo).join()) {
      rankingChanged += 1;
    }
    if (a[0].boatNo !== b[0].boatNo) topBoatChanged += 1;
    if (!aWin && bWin) {
      added += 1;
      addedRaceKeys.push(row.raceKey);
    }
    if (aWin && !bWin) {
      lost += 1;
      lostRaceKeys.push(row.raceKey);
    }
    topBoatDistribution[b[0].boatNo] =
      (topBoatDistribution[b[0].boatNo] || 0) + 1;
  }

  return {
    raceCount: rows.length,
    top1,
    added,
    lost,
    netTop1: added - lost,
    top3,
    meanWinnerRank: rounded(winnerRankSum / rows.length),
    pairwiseFinishOrder: {
      concordant: pairwiseConcordant,
      comparable: pairwiseComparable,
      rate: rounded(pairwiseConcordant / pairwiseComparable)
    },
    rankingChangedRaceCount: rankingChanged,
    topBoatChangedRaceCount: topBoatChanged,
    topBoatDistribution,
    addedRaceKeys,
    lostRaceKeys
  };
}

function compactSummary(summary, includeRaceKeys = false) {
  if (includeRaceKeys) return summary;
  const { addedRaceKeys, lostRaceKeys, ...compact } = summary;
  return compact;
}

function equalChronologicalHalves(rows) {
  const midpoint = Math.floor(rows.length / 2);
  return [rows.slice(0, midpoint), rows.slice(midpoint)];
}

function factorEvaluation(rows, weightConfig, factor, includeRaceKeys = false) {
  const halves = equalChronologicalHalves(rows);
  return {
    factor,
    all: compactSummary(
      pairedSummary(rows, weightConfig, { courseSpreadFactor: factor }),
      includeRaceKeys
    ),
    chronologicalHalves: halves.map((half, index) => ({
      half: index + 1,
      ...compactSummary(
        pairedSummary(half, weightConfig, { courseSpreadFactor: factor }),
        includeRaceKeys
      )
    }))
  };
}

function missAttribution(rows, weightConfig) {
  const baseline = scoreAb.baselineProfile(weightConfig);
  const components = Object.fromEntries(
    scoreAb.COMPONENT_ORDER.map(key => [key, {
      baselineTopSum: 0,
      officialWinnerSum: 0,
      differenceSum: 0,
      weightedDifferenceSum: 0,
      winnerHigher: 0,
      equal: 0,
      baselineTopHigher: 0
    }])
  );
  const winnerRankCounts = {};
  const strongestTopAdvantage = {};
  const strongestWinnerAdvantage = {};
  const baselineTopBoatDistribution = {};
  const officialWinnerBoatDistribution = {};
  const boatPaths = {};
  const rawGaps = [];
  const roundedGaps = [];
  const missRaceKeys = [];
  let baselineTop1Hits = 0;
  let noObservedWinnerAdvantage = 0;
  let topRoundedTieCount = 0;
  let rawRankingDifferenceCount = 0;
  let rawTopDifferenceCount = 0;
  let topOrWinnerClampCount = 0;
  const correctHitDominantMargin = {};
  const courseRange = {
    belowMinimumBoatCount: 0,
    aboveMaximumBoatCount: 0,
    raceCountWithAnyOutOfRange: 0
  };

  for (const row of rows) {
    const ranked = scoreAb.rankAnalyses(row.analyses, baseline, weightConfig);
    const rawRanked = [...ranked].sort((left, right) =>
      right.rawTotal - left.rawTotal ||
      right.roleAttack - left.roleAttack ||
      left.boatNo - right.boatNo
    );
    const top = ranked[0];
    const winner = ranked.find(item => item.boatNo === row.winnerBoatNo);
    baselineTopBoatDistribution[top.boatNo] =
      (baselineTopBoatDistribution[top.boatNo] || 0) + 1;
    officialWinnerBoatDistribution[winner.boatNo] =
      (officialWinnerBoatDistribution[winner.boatNo] || 0) + 1;
    boatPaths[`${top.boatNo}->${winner.boatNo}`] =
      (boatPaths[`${top.boatNo}->${winner.boatNo}`] || 0) + 1;
    if (top.total === ranked[1].total) topRoundedTieCount += 1;
    if (rawRanked.map(item => item.boatNo).join() !== ranked.map(item => item.boatNo).join()) {
      rawRankingDifferenceCount += 1;
    }
    if (rawRanked[0].boatNo !== ranked[0].boatNo) {
      rawTopDifferenceCount += 1;
    }
    let outOfRange = false;
    for (const analysis of row.analyses) {
      const value = analysis.courseStructureTheory.appliedIndex;
      if (value < weightConfig.target.minimumScore) {
        courseRange.belowMinimumBoatCount += 1;
        outOfRange = true;
      }
      if (value > weightConfig.target.maximumScore) {
        courseRange.aboveMaximumBoatCount += 1;
        outOfRange = true;
      }
    }
    if (outOfRange) courseRange.raceCountWithAnyOutOfRange += 1;

    if (top.boatNo === winner.boatNo) {
      baselineTop1Hits += 1;
      const runnerUp = ranked[1];
      const margins = scoreAb.COMPONENT_ORDER.map(key => ({
        key,
        value:
          (top.components[key] - runnerUp.components[key]) * baseline.weights[key]
      })).sort((left, right) => right.value - left.value);
      correctHitDominantMargin[margins[0].key] =
        (correctHitDominantMargin[margins[0].key] || 0) + 1;
      continue;
    }

    missRaceKeys.push(row.raceKey);
    winnerRankCounts[winner.rank] = (winnerRankCounts[winner.rank] || 0) + 1;
    const rawGap = top.rawTotal - winner.rawTotal;
    rawGaps.push(rawGap);
    roundedGaps.push(top.total - winner.total);
    if (
      top.rawTotal <= weightConfig.target.minimumScore ||
      top.rawTotal >= weightConfig.target.maximumScore ||
      winner.rawTotal <= weightConfig.target.minimumScore ||
      winner.rawTotal >= weightConfig.target.maximumScore
    ) topOrWinnerClampCount += 1;

    const contributions = scoreAb.COMPONENT_ORDER.map(key => {
      const topValue = top.components[key];
      const winnerValue = winner.components[key];
      const difference = winnerValue - topValue;
      const weightedDifference = difference * baseline.weights[key];
      const accumulator = components[key];
      accumulator.baselineTopSum += topValue;
      accumulator.officialWinnerSum += winnerValue;
      accumulator.differenceSum += difference;
      accumulator.weightedDifferenceSum += weightedDifference;
      if (difference > 1e-12) accumulator.winnerHigher += 1;
      else if (difference < -1e-12) accumulator.baselineTopHigher += 1;
      else accumulator.equal += 1;
      return { key, weightedDifference };
    });
    const strongestTop = [...contributions]
      .sort((left, right) => left.weightedDifference - right.weightedDifference)[0];
    strongestTopAdvantage[strongestTop.key] =
      (strongestTopAdvantage[strongestTop.key] || 0) + 1;
    const strongestWinner = [...contributions]
      .filter(item => item.weightedDifference > 1e-12)
      .sort((left, right) => right.weightedDifference - left.weightedDifference)[0];
    if (strongestWinner) {
      strongestWinnerAdvantage[strongestWinner.key] =
        (strongestWinnerAdvantage[strongestWinner.key] || 0) + 1;
    } else {
      noObservedWinnerAdvantage += 1;
    }
  }

  rawGaps.sort((left, right) => left - right);
  roundedGaps.sort((left, right) => left - right);
  const misses = missRaceKeys.length;
  const componentSummary = Object.fromEntries(
    scoreAb.COMPONENT_ORDER.map(key => {
      const row = components[key];
      return [key, {
        baselineTopMean: rounded(row.baselineTopSum / misses, 6),
        officialWinnerMean: rounded(row.officialWinnerSum / misses, 6),
        meanDifference: rounded(row.differenceSum / misses, 6),
        meanWeightedDifference: rounded(row.weightedDifferenceSum / misses, 9),
        winnerHigher: row.winnerHigher,
        equal: row.equal,
        baselineTopHigher: row.baselineTopHigher
      }];
    })
  );
  const gapSummary = values => ({
    minimum: rounded(values[0], 6),
    p25: rounded(values[Math.floor((values.length - 1) * 0.25)], 6),
    medianLower: rounded(values[Math.floor((values.length - 1) * 0.5)], 6),
    p75: rounded(values[Math.floor((values.length - 1) * 0.75)], 6),
    maximum: rounded(values.at(-1), 6),
    mean: rounded(values.reduce((sum, value) => sum + value, 0) / values.length, 6),
    atMostTwoCount: values.filter(value => value <= 2 + 1e-12).length,
    aboveTwoCount: values.filter(value => value > 2 + 1e-12).length
  });

  return {
    baselineTop1HitCount: baselineTop1Hits,
    baselineTop1MissCount: misses,
    missRaceKeys,
    missFingerprint: scoreAb.fingerprint(missRaceKeys),
    winnerRankCounts,
    scoreGap: {
      raw: gapSummary(rawGaps),
      rounded: gapSummary(roundedGaps)
    },
    componentSummary,
    strongestBaselineTopAdvantage: strongestTopAdvantage,
    strongestOfficialWinnerAdvantage: strongestWinnerAdvantage,
    noObservedOfficialWinnerAdvantageCount: noObservedWinnerAdvantage,
    baselineTopBoatDistribution,
    officialWinnerBoatDistribution,
    boatPaths,
    courseIndexRange: {
      ...courseRange,
      outOfRangeBoatCount:
        courseRange.belowMinimumBoatCount + courseRange.aboveMaximumBoatCount
    },
    correctHitDominantMargin,
    roundingClampTieDiagnostics: {
      topRoundedTieRaceCount: topRoundedTieCount,
      rawVsProductionFullRankingDifferenceRaceCount: rawRankingDifferenceCount,
      missTopOrWinnerClampRaceCount: topOrWinnerClampCount,
      productionTopChangedByRawRankingRaceCount: rawTopDifferenceCount
    }
  };
}

function validNeighborhoodProfiles(weightConfig) {
  const baseline = scoreAb.baselineProfile(weightConfig);
  const result = [];
  for (const receiver of scoreAb.COMPONENT_ORDER) {
    for (const donor of scoreAb.COMPONENT_ORDER) {
      if (receiver === donor) continue;
      for (let basisPoints = 1; basisPoints <= 10; basisPoints += 1) {
        const delta = basisPoints / 1000;
        const candidate = {
          id: `receiver-${receiver}-donor-${donor}-${basisPoints}`,
          kind: "candidate",
          hypothesis: "retrospective two-component transfer sanity profile",
          weights: { ...baseline.weights }
        };
        candidate.weights[receiver] += delta;
        candidate.weights[donor] -= delta;
        const trial = structuredClone(weightConfig);
        trial.profiles = [structuredClone(baseline), candidate];
        try {
          scoreAb.validateConfig(trial);
          result.push(candidate);
        } catch {
          // Invalid profiles are outside the already-fixed production constraints.
        }
      }
    }
  }
  return result;
}

function weightNeighborhoodSanity(rows, weightConfig) {
  const baseline = scoreAb.baselineProfile(weightConfig);
  const baselineTop = new Map(rows.map(row => [
    row.raceKey,
    scoreAb.rankAnalyses(row.analyses, baseline, weightConfig)[0].boatNo
  ]));
  const recovered = new Set();
  let maximumNetTop1 = -Infinity;
  let maximumAdded = 0;
  const profiles = validNeighborhoodProfiles(weightConfig);
  for (const profile of profiles) {
    let added = 0;
    let lost = 0;
    for (const row of rows) {
      const top = rankAnalyses(
        row.analyses,
        weightConfig,
        profile.weights
      )[0].boatNo;
      const baselineWin = baselineTop.get(row.raceKey) === row.winnerBoatNo;
      const candidateWin = top === row.winnerBoatNo;
      if (!baselineWin && candidateWin) {
        added += 1;
        recovered.add(row.raceKey);
      }
      if (baselineWin && !candidateWin) lost += 1;
    }
    maximumAdded = Math.max(maximumAdded, added);
    maximumNetTop1 = Math.max(maximumNetTop1, added - lost);
  }
  return {
    generation: {
      orderedReceiverDonorPairs: true,
      deltaMinimum: 0.001,
      deltaMaximum: 0.01,
      deltaStep: 0.001,
      existingWeightConstraintsApplied: true
    },
    validProfileCount: profiles.length,
    recoveredBaselineMissUnionCount: recovered.size,
    maximumAddedTop1: maximumAdded,
    maximumNetTop1,
    retrospectiveUnpreregistered: true
  };
}

function buildReport(options = {}) {
  const { analysisConfig, weightConfig, replay, settled } = loadDiscovery(options);
  const rows = settled.rows;
  const expected = analysisConfig.cohort;
  assert(replay.rows.length === expected.expectedReplayRaceCount, "discovery replay race count changed");
  assert(
    replay.rows.reduce((sum, row) => sum + row.analyses.length, 0) ===
      expected.expectedReplayBoatCount,
    "discovery replay boat count changed"
  );
  assert(rows.length === expected.expectedSettledRaceCount, "discovery settled race count changed");
  const fingerprints = {
    replay: scoreAb.cohortFingerprint(replay.rows),
    settled: scoreAb.cohortFingerprint(settledFingerprintRows(rows))
  };
  assert(fingerprints.replay === expected.expectedFingerprints.replay, "discovery replay fingerprint changed");
  assert(fingerprints.settled === expected.expectedFingerprints.settled, "discovery settled fingerprint changed");

  const attribution = missAttribution(rows, weightConfig);
  assert(
    attribution.baselineTop1HitCount === expected.expectedBaselineTop1HitCount,
    "baseline discovery top1 hit count changed"
  );
  assert(
    attribution.baselineTop1MissCount === expected.expectedBaselineTop1MissCount,
    "baseline discovery top1 miss count changed"
  );
  assert(
    attribution.missFingerprint === expected.expectedFingerprints.missSubset,
    "discovery miss subset fingerprint changed"
  );
  const halves = equalChronologicalHalves(rows);
  const missHalfCounts = halves.map(half =>
    half.filter(row =>
      scoreAb.rankAnalyses(
        row.analyses,
        scoreAb.baselineProfile(weightConfig),
        weightConfig
      )[0].boatNo !== row.winnerBoatNo
    ).length
  );
  assert(
    JSON.stringify(missHalfCounts) === JSON.stringify(expected.expectedMissHalfCounts),
    "discovery miss half counts changed"
  );

  const factors = analysisConfig.courseSensitivity.factors;
  const factorCurve = factors.map(factor =>
    factorEvaluation(
      rows,
      weightConfig,
      factor,
      factor === analysisConfig.courseSensitivity.exploratoryHypothesis.factor
    )
  );
  const baseline = factorCurve.find(item => item.factor === 1);
  const eligible = factorCurve.filter(item => item.factor < 1).filter(item =>
    item.all.netTop1 > 0 &&
    item.chronologicalHalves.every(half => half.netTop1 >= 0) &&
    item.all.top3 >= baseline.all.top3 &&
    item.all.meanWinnerRank <= baseline.all.meanWinnerRank
  );
  const selected = eligible[0] || null;
  assert(
    selected?.factor === analysisConfig.courseSensitivity.exploratoryHypothesis.factor,
    "exploratory course spread hypothesis changed"
  );
  const naturalClamp = {
    all: compactSummary(pairedSummary(rows, weightConfig, { naturalCourseClamp: true })),
    chronologicalHalves: halves.map((half, index) => ({
      half: index + 1,
      ...compactSummary(pairedSummary(half, weightConfig, { naturalCourseClamp: true }))
    }))
  };
  const neighborhood = weightNeighborhoodSanity(rows, weightConfig);
  assert(
    neighborhood.validProfileCount ===
      analysisConfig.priorWeightNeighborhoodSanity.expectedValidProfileCount,
    "valid weight-neighborhood profile count changed"
  );
  assert(
    neighborhood.recoveredBaselineMissUnionCount ===
      analysisConfig.priorWeightNeighborhoodSanity.expectedRecoveredBaselineMissUnionCount,
    "weight-neighborhood recovered miss union changed"
  );
  assert(
    neighborhood.maximumNetTop1 ===
      analysisConfig.priorWeightNeighborhoodSanity.expectedMaximumNetTop1,
    "weight-neighborhood maximum net top1 changed"
  );

  const selectedPValue = scoreAb.oneSidedExactBinomial(
    selected.all.lost,
    selected.all.added
  );
  const firstHalfEligibleFactors = factorCurve
    .filter(item => item.factor < 1)
    .filter(item => item.chronologicalHalves[0].netTop1 > 0)
    .map(item => item.factor);
  const discoveryIdentityConfig = structuredClone(weightConfig);
  discoveryIdentityConfig.cohort.expectedReplayBasisBoatCount =
    expected.expectedReplayBoatCount;
  const identity = weightReport.baselineIdentity(
    replay.rows,
    scoreAb.baselineProfile(weightConfig),
    discoveryIdentityConfig
  );
  assert(identity.exact, "discovery baseline identity changed");

  return {
    schemaVersion: 1,
    analysisId: analysisConfig.analysisId,
    status: analysisConfig.status,
    generatedAt: analysisConfig.createdAt,
    source: {
      sourceCommit: analysisConfig.sourceCommit,
      weightAbPreregistrationCommit:
        analysisConfig.upstream.weightAbPreregistrationCommit,
      inputFreezeCommit: analysisConfig.upstream.inputFreezeCommit,
      retrospectiveOnly: true,
      candidatePreregisteredBeforeOutcomes: false
    },
    fingerprints: {
      ...fingerprints,
      missSubset: attribution.missFingerprint,
      analysisConfig: scoreAb.fingerprint(analysisConfig)
    },
    cohort: {
      scope: expected.scope,
      dates: expected.discoveryDates,
      replayRaceCount: replay.rows.length,
      replayBoatCount: replay.rows.reduce(
        (sum, row) => sum + row.analyses.length,
        0
      ),
      settledRaceCount: rows.length,
      baselineTop1HitCount: attribution.baselineTop1HitCount,
      baselineTop1MissCount: attribution.baselineTop1MissCount,
      chronologicalHalfRaceCounts: halves.map(half => half.length),
      chronologicalHalfMissCounts: missHalfCounts,
      holdoutDatesForbidden: expected.forbiddenHoldoutDates,
      holdoutResultsRead: false,
      holdoutEvaluated: false
    },
    definition: {
      ...analysisConfig.missDefinition,
      label: "discovery top-1 score miss",
      notTicketMiss: true,
      causalClaim: false
    },
    baselineIdentity: {
      scope: "discovery-only",
      ...identity
    },
    attribution: {
      comparison: analysisConfig.attribution.comparison,
      componentOrder: analysisConfig.attribution.componentOrder,
      scopeMap: {
        componentsWinnerRanksGapsAndStrongestAdvantages:
          "134 discovery top-1 score misses",
        boatDistributionsAndPaths: "all 258 discovery races",
        correctHitDominantMargin: "124 discovery top-1 score hits",
        courseIndexRange: "all 1548 discovery boats",
        roundingAndRankingDiagnostics:
          "all 258 discovery races; miss clamp count uses the 134 misses"
      },
      components: attribution.componentSummary,
      winnerRankCounts: attribution.winnerRankCounts,
      scoreGap: attribution.scoreGap,
      strongestBaselineTopAdvantage:
        attribution.strongestBaselineTopAdvantage,
      strongestOfficialWinnerAdvantage:
        attribution.strongestOfficialWinnerAdvantage,
      noObservedOfficialWinnerAdvantageCount:
        attribution.noObservedOfficialWinnerAdvantageCount,
      baselineTopBoatDistribution:
        attribution.baselineTopBoatDistribution,
      officialWinnerBoatDistribution:
        attribution.officialWinnerBoatDistribution,
      boatPaths: attribution.boatPaths,
      correctHitDominantMargin: attribution.correctHitDominantMargin,
      courseIndexRange: attribution.courseIndexRange,
      roundingClampTieDiagnostics:
        attribution.roundingClampTieDiagnostics,
      structuralVsWeightAssessment: {
        result: "descriptive-inner-course-pattern-dominant-local-weight-tuning-unsupported",
        structuralDiagnosticComponents: [
          "courseIndex",
          "raceFlow",
          "roleHold"
        ],
        structuralDiagnosticMeanWeightedDeficit: rounded(-(
          attribution.componentSummary.courseIndex.meanWeightedDifference +
          attribution.componentSummary.raceFlow.meanWeightedDifference +
          attribution.componentSummary.roleHold.meanWeightedDifference
        )),
        shareOfMeanRawGap: rounded(-(
          attribution.componentSummary.courseIndex.meanWeightedDifference +
          attribution.componentSummary.raceFlow.meanWeightedDifference +
          attribution.componentSummary.roleHold.meanWeightedDifference
        ) / attribution.scoreGap.raw.mean),
        priorLocalWeightProfilesRecoveringAnyBaselineMiss:
          neighborhood.recoveredBaselineMissUnionCount,
        causalClaim: false
      },
      accountingExact:
        Object.values(attribution.strongestBaselineTopAdvantage)
          .reduce((sum, count) => sum + count, 0) ===
          attribution.baselineTop1MissCount,
      interpretation:
        "Weighted component margins are overlapping diagnostics, not causal feature importance."
    },
    priorWeightNeighborhoodSanity: neighborhood,
    courseSensitivity: {
      transformation:
        analysisConfig.courseSensitivity.spreadFormula,
      factors,
      factorCurve,
      naturalOneToOneHundredClamp: {
        status: analysisConfig.courseSensitivity.naturalClamp.status,
        ...naturalClamp
      },
      exploratoryHypothesis: {
        id: "course-index-within-race-spread-factor-090",
        factor: selected.factor,
        formula:
          analysisConfig.courseSensitivity.spreadFormula,
        duplicateOfPriorWeightProfiles: false,
        why:
          "CourseIndex is the largest model-side contribution in 119/134 misses, while the 0.90 spread factor is the smallest explored compression with positive full-discovery net top1 and non-harmful equal-count halves.",
        measuredRetrospectiveImpact: {
          baseline: baseline.all,
          candidate: selected.all,
          chronologicalHalves: selected.chronologicalHalves,
          oneSidedExactPValue: selectedPValue
        },
        evidenceStrength: "weak",
        approved: false,
        usableForPrediction: false,
        rollback: "Set factor back to 1.00.",
        requiredNextStep:
          analysisConfig.courseSensitivity.exploratoryHypothesis.requiredNextStep
      },
      formalProposalEligibility: {
        eligible: false,
        decision: "no-supported-change-proposal",
        reasons: [
          "retrospective-multiple-profile-search",
          "one-sided-exact-p-value-0.5",
          "no-positive-first-half-selection-candidate"
        ],
        firstHalfPositiveNetFactors: firstHalfEligibleFactors
      }
    },
    decision: {
      result: "no-supported-change-proposal",
      oneWeakFutureShadowHypothesisRecorded: true,
      productionChangeAllowed: false,
      explicitOwnerApprovalRequiredBeforeFutureShadow: true,
      maximumNextAction:
        "review one new preregistered future-shadow experiment proposal"
    },
    limitations: {
      roleComponentsOverlapRawSignals: true,
      courseIndexIncludesLegacyCompatibilityOffset: true,
      savedReplayCannotReconstructScenariosMarksSelectionsOrTickets: true,
      newEnvironmentActiveEvidenceRaceCount: 0,
      multiplicityAdjustedInferencePerformed: false,
      holdoutIsNotClaimedAsProspectiveOutcomeTimeEvidence: true
    },
    safety: analysisConfig.safety
  };
}

function serialize(report) {
  return `${JSON.stringify(report, null, 2)}\n`;
}

function writeReport(report, reportPath = REPORT_PATH) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, serialize(report));
}

function checkReport(report, reportPath = REPORT_PATH) {
  const expected = serialize(report);
  const actual = fs.readFileSync(reportPath, "utf8");
  if (actual !== expected) {
    throw new Error(
      "effective score miss-attribution report is stale; run " +
      "node scripts/build-effective-score-miss-attribution-report.js"
    );
  }
}

function main() {
  const report = buildReport();
  if (process.argv.includes("--check")) {
    checkReport(report);
    console.log("effective score miss-attribution report is reproducible");
    return;
  }
  writeReport(report);
  console.log(
    `effective score miss attribution: ${report.cohort.settledRaceCount} races / ` +
    `${report.cohort.baselineTop1MissCount} misses / ` +
    `${report.decision.result}`
  );
}

if (require.main === module) main();

module.exports = {
  ANALYSIS_CONFIG_PATH,
  REPORT_PATH,
  WEIGHT_CONFIG_PATH,
  buildReport,
  checkReport,
  factorEvaluation,
  loadDiscovery,
  missAttribution,
  pairedSummary,
  rankAnalyses,
  serialize,
  validNeighborhoodProfiles,
  weightNeighborhoodSanity,
  writeReport
};
