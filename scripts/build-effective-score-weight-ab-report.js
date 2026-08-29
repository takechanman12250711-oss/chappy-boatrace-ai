"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const inputContract = require("./analysis-input-contract");
const scoreAb = require("../js/effective-score-weight-ab");

const ROOT = path.resolve(__dirname, "..");
const CONFIG_PATH = path.join(
  ROOT,
  "config",
  "effective-score-weight-ab-v1.json"
);
const INPUT_FREEZE_PATH = path.join(
  ROOT,
  "config",
  "effective-score-weight-ab-input-freeze-v1.json"
);
const AI_CORE_PATH = path.join(ROOT, "js", "ai-core.js");
const REPORT_PATH = path.join(
  ROOT,
  "data",
  "stats",
  "effective-score-weight-ab-report.json"
);
const PREREGISTRATION_COMMIT =
  "0f27c5467e7e838c64213c6f3d5eff274c4de86a";
const INPUT_FREEZE_COMMIT =
  "37dfdc3a390d27bd6067ef2c2ad06fe1da028b74";
const ANALYSIS_INPUT_CONTRACT = "official-pre-deadline-cohort-v1";
const ISO_TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256Text(value) {
  return `sha256:${crypto
    .createHash("sha256")
    .update(String(value))
    .digest("hex")}`;
}

function normalizedDate(value) {
  const result = String(value || "").replace(/\D/g, "").slice(0, 8);
  return /^\d{8}$/.test(result) ? result : "";
}

function parseTimestamp(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  const match = raw.match(ISO_TIMESTAMP);
  if (!match) return NaN;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const timezone = match[7];
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31
  ];
  const timezoneParts = timezone === "Z"
    ? [0, 0]
    : timezone.slice(1).split(":").map(Number);
  if (
    month < 1 || month > 12 ||
    day < 1 || day > daysInMonth[month - 1] ||
    hour > 23 || minute > 59 || second > 59 ||
    timezoneParts[0] > 23 || timezoneParts[1] > 59
  ) {
    return NaN;
  }
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? timestamp : NaN;
}

function captureTimestamp(record = {}) {
  return parseTimestamp(
    record?.selectedAt || record?.capturedAt || record?.createdAt || ""
  );
}

function valueAtPath(value, dottedPath) {
  return String(dottedPath || "")
    .split(".")
    .filter(Boolean)
    .reduce((current, key) => current?.[key], value);
}

function finiteNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`${label} must be finite`);
  }
  return number;
}

function snapshotAnalysis(analysis = {}) {
  const boatNo = Number(analysis?.boatNo);
  if (!Number.isInteger(boatNo) || boatNo < 1 || boatNo > 6) {
    throw new Error("replayBasis analysis has an invalid boatNo");
  }

  const indexKeys = [
    "raceFlow",
    "st",
    "exhibition",
    "local",
    "turn",
    "national",
    "motor",
    "total"
  ];
  const roleKeys = ["attack", "hold", "pickup"];

  return {
    boatNo,
    indexes: Object.fromEntries(
      indexKeys.map(key => [
        key,
        finiteNumber(analysis?.indexes?.[key], `boat ${boatNo} indexes.${key}`)
      ])
    ),
    roleScores: Object.fromEntries(
      roleKeys.map(key => [
        key,
        finiteNumber(
          analysis?.roleScores?.[key],
          `boat ${boatNo} roleScores.${key}`
        )
      ])
    ),
    courseStructureTheory: {
      appliedIndex: finiteNumber(
        analysis?.courseStructureTheory?.appliedIndex,
        `boat ${boatNo} courseStructureTheory.appliedIndex`
      )
    },
    totalRank: finiteNumber(
      analysis?.totalRank,
      `boat ${boatNo} totalRank`
    ),
    aiRank: finiteNumber(
      analysis?.aiRank,
      `boat ${boatNo} aiRank`
    )
  };
}

function newEnvironmentMode(record = {}) {
  const prediction = record?.prediction || {};
  const conditions = prediction?.preRaceConditions || record?.preRaceConditions || {};
  if (conditions?.newEngineMode === true) return true;
  if (conditions?.newEngineMode === false) return false;
  return null;
}

function configuredWindow(config) {
  const splitDates = [
    ...(config?.cohort?.discoveryDates || []),
    ...(config?.cohort?.holdoutDates || [])
  ].map(normalizedDate).filter(Boolean);
  if (!splitDates.length) throw new Error("configured cohort dates are missing");

  const firstDate = [...splitDates].sort()[0];
  const frozenDate = normalizedDate(config?.frozenAt);
  if (!frozenDate || frozenDate < firstDate) {
    throw new Error("config frozenAt does not define a valid cohort window");
  }
  return { firstDate, lastDate: frozenDate };
}

function predictionFilesInWindow(predictionsDir, config) {
  const { firstDate, lastDate } = configuredWindow(config);
  return fs.readdirSync(predictionsDir)
    .filter(name => /^\d{8}\.json$/.test(name))
    .map(name => ({ name, date: name.slice(0, 8) }))
    .filter(item => item.date >= firstDate && item.date <= lastDate)
    .sort((left, right) => left.date.localeCompare(right.date));
}

function collectReplayBasisCohort(options = {}) {
  const root = options.root || ROOT;
  const config = options.config;
  const predictionsDir =
    options.predictionsDir || path.join(root, "data", "predictions");
  const result = [];
  const excludedReasons = {};
  const perDate = {};
  let frozenPrimaryPredictionCount = 0;
  let frozenVerificationPredictionCount = 0;
  let canonicalPredictionCount = 0;
  let preDeadlinePredictionCount = 0;
  const frozenAtTimestamp = parseTimestamp(config.frozenAt);
  if (!Number.isFinite(frozenAtTimestamp)) {
    throw new Error("config frozenAt timestamp is invalid");
  }

  for (const { name, date } of predictionFilesInWindow(predictionsDir, config)) {
    const payload = readJson(path.join(predictionsDir, name));
    const rawPrimaryRows = Array.isArray(payload?.predictions)
      ? payload.predictions
      : [];
    const rawVerificationRows = Array.isArray(payload?.verificationPredictions)
      ? payload.verificationPredictions
      : [];
    // Freeze each source before canonical precedence is applied. Otherwise a
    // primary row captured after frozenAt could overwrite an already frozen
    // verification row for the same race on a future CI run.
    const primaryRows = rawPrimaryRows.filter(record =>
      captureTimestamp(record) <= frozenAtTimestamp
    );
    const verificationRows = rawVerificationRows.filter(record =>
      captureTimestamp(record) <= frozenAtTimestamp
    );
    const canonicalRows = inputContract.mergePredictionSources(
      primaryRows,
      verificationRows
    );
    const dateDiagnostics = {
      primaryPredictionCountAtOrBeforeFreeze: primaryRows.length,
      verificationPredictionCountAtOrBeforeFreeze: verificationRows.length,
      canonicalPredictionCount: canonicalRows.length,
      preDeadlinePredictionCount: 0,
      replayBasisRaceCount: 0
    };

    frozenPrimaryPredictionCount += primaryRows.length;
    frozenVerificationPredictionCount += verificationRows.length;
    canonicalPredictionCount += canonicalRows.length;

    for (const record of canonicalRows) {
      const reason = inputContract.preDeadlineReason(record);
      if (reason) {
        excludedReasons[reason] = (excludedReasons[reason] || 0) + 1;
        continue;
      }
      preDeadlinePredictionCount += 1;
      dateDiagnostics.preDeadlinePredictionCount += 1;

      const basis = valueAtPath(record, config.cohort.replayBasisPath);
      if (!basis) continue;

      const raceKey = inputContract.raceKey(record);
      if (!raceKey || raceKey.slice(0, 8) !== date) {
        throw new Error(`replayBasis race key is invalid in ${name}`);
      }
      if (basis?.source !== config.cohort.replayBasisSource) {
        throw new Error(`replayBasis source mismatch: ${raceKey}`);
      }
      if (!Array.isArray(basis?.analyses) || basis.analyses.length !== 6) {
        throw new Error(`replayBasis must contain exactly six analyses: ${raceKey}`);
      }

      const analyses = basis.analyses.map(snapshotAnalysis);
      if (new Set(analyses.map(analysis => analysis.boatNo)).size !== 6) {
        throw new Error(`replayBasis boat numbers are not unique: ${raceKey}`);
      }

      result.push({
        raceKey,
        date,
        selectedAt: String(record?.selectedAt || record?.capturedAt || ""),
        deadlineAt: String(record?.deadlineAt || record?.deadline || ""),
        replayBasisSchemaVersion: Number(basis?.schemaVersion || 0),
        replayBasisSource: String(basis?.source || ""),
        aiCoreVersion: String(basis?.aiCoreVersion || ""),
        newEnvironmentMode: newEnvironmentMode(record),
        newEnvironmentModeSource:
          "prediction.preRaceConditions.newEngineMode",
        analyses
      });
      dateDiagnostics.replayBasisRaceCount += 1;
    }
    perDate[date] = dateDiagnostics;
  }

  result.sort((left, right) => left.raceKey.localeCompare(right.raceKey));
  return {
    rows: result,
    diagnostics: {
      ...configuredWindow(config),
      predictionFileCount: Object.keys(perDate).length,
      primaryPredictionCountAtOrBeforeFreeze: frozenPrimaryPredictionCount,
      verificationPredictionCountAtOrBeforeFreeze:
        frozenVerificationPredictionCount,
      frozenAt: config.frozenAt,
      captureFreezeAppliedBeforeCanonicalMerge: true,
      canonicalPredictionCount,
      preDeadlinePredictionCount,
      excludedPredictionCount: Object.values(excludedReasons)
        .reduce((sum, count) => sum + count, 0),
      excludedReasons,
      replayBasisRaceCount: result.length,
      replayBasisBoatCount: result.reduce(
        (sum, row) => sum + row.analyses.length,
        0
      ),
      canonicalDeduplication: config.cohort.canonicalDeduplication,
      perDate
    }
  };
}

function joinOfficialResults(replayRows, options = {}) {
  const root = options.root || ROOT;
  const config = options.config;
  if (!config) throw new Error("official result join requires the fixed config");
  const resultsDir = options.resultsDir || path.join(root, "data", "results");
  const evaluationDates = new Set([
    ...config.cohort.discoveryDates,
    ...config.cohort.holdoutDates
  ]);
  const evaluationRows = replayRows.filter(row => evaluationDates.has(row.date));
  const inventoryOnlyRows = replayRows.filter(row => !evaluationDates.has(row.date));
  const keys = new Set(evaluationRows.map(row => row.raceKey));
  const officialResults = inputContract.collectOfficialResults(resultsDir, keys);
  const records = [];

  for (const row of evaluationRows) {
    const officialResult = officialResults.get(row.raceKey);
    if (!officialResult) continue;
    const finishOrder = inputContract.finishOrder(officialResult);
    if (finishOrder.length !== 3) continue;
    records.push({
      ...row,
      finishOrder,
      winnerBoatNo: finishOrder[0]
    });
  }
  return {
    rows: records,
    diagnostics: {
      officialResultCount: officialResults.size,
      settledJoinCount: records.length,
      evaluationInputRaceCount: evaluationRows.length,
      missingOfficialResultCount: evaluationRows.length - records.length,
      inventoryOnlyRaceCount: inventoryOnlyRows.length,
      inventoryOnlyDates: [...new Set(inventoryOnlyRows.map(row => row.date))],
      inventoryOnlyRowsExcludedBeforeOfficialJoin: true,
      resultSourceRequired: "boatrace-official",
      resultMissingRowsExcluded: true
    }
  };
}

function productionFormulaSource(source) {
  const marker = "indexes.total = clamp(";
  const endMarker = "\n\nconst roleRanking";
  const starts = [];
  let cursor = 0;
  while ((cursor = source.indexOf(marker, cursor)) >= 0) {
    starts.push(cursor);
    cursor += marker.length;
  }
  if (starts.length !== 1) {
    throw new Error(`expected one effective score formula, found ${starts.length}`);
  }
  const end = source.indexOf(endMarker, starts[0]);
  if (end < 0) throw new Error("effective score formula end marker is missing");
  return source.slice(starts[0], end).replace(/\s+/g, " ").trim();
}

function productionFormulaWeights(formulaSource, baselineProfile) {
  const symbols = {
    raceFlow: "indexes\\.raceFlow",
    courseIndex: "courseIndex",
    roleAttack: "roleScores\\.attack",
    st: "indexes\\.st",
    exhibition: "indexes\\.exhibition",
    roleHold: "roleScores\\.hold",
    rolePickup: "roleScores\\.pickup",
    local: "indexes\\.local",
    turn: "indexes\\.turn",
    national: "indexes\\.national",
    motor: "indexes\\.motor"
  };
  const parsed = {};
  for (const [key, symbol] of Object.entries(symbols)) {
    const match = formulaSource.match(
      new RegExp(`${symbol} \\* ([0-9]+(?:\\.[0-9]+)?)`)
    );
    if (!match) throw new Error(`production formula is missing ${key}`);
    parsed[key] = Number(match[1]);
    if (Math.abs(parsed[key] - baselineProfile.weights[key]) > 1e-12) {
      throw new Error(
        `production formula ${key} does not match preregistered baseline`
      );
    }
  }
  return parsed;
}

function validateExpectedCohort(config, replay, settled) {
  const boatCount = replay.rows.reduce(
    (sum, row) => sum + row.analyses.length,
    0
  );
  const expected = config.cohort;
  if (replay.rows.length !== expected.expectedReplayBasisRaceCount) {
    throw new Error(
      `replayBasis race count changed: ${replay.rows.length} != ` +
      expected.expectedReplayBasisRaceCount
    );
  }
  if (boatCount !== expected.expectedReplayBasisBoatCount) {
    throw new Error(
      `replayBasis boat count changed: ${boatCount} != ` +
      expected.expectedReplayBasisBoatCount
    );
  }
  if (settled.rows.length !== expected.expectedSettledRaceCount) {
    throw new Error(
      `settled race count changed: ${settled.rows.length} != ` +
      expected.expectedSettledRaceCount
    );
  }

  const evaluationDates = new Set([
    ...expected.discoveryDates,
    ...expected.holdoutDates
  ]);
  const unexpectedSettled = settled.rows.filter(
    row => !evaluationDates.has(row.date)
  );
  if (unexpectedSettled.length) {
    throw new Error("settled rows exist outside preregistered evaluation dates");
  }
}

function inputFreezeActual(replay, settled) {
  return {
    replayBasisRaceCount: replay.rows.length,
    replayBasisBoatCount: replay.rows.reduce(
      (sum, row) => sum + row.analyses.length,
      0
    ),
    settledEvaluationRaceCount: settled.rows.length,
    replayBasisCohortFingerprint: scoreAb.cohortFingerprint(replay.rows),
    settledEvaluationCohortFingerprint: scoreAb.cohortFingerprint(
      settled.rows.map(row => ({
        raceKey: row.raceKey,
        date: row.date,
        selectedAt: row.selectedAt,
        finishOrder: row.finishOrder,
        analyses: row.analyses
      }))
    )
  };
}

function validateInputFreeze(config, inputFreeze, actual) {
  if (inputFreeze?.experimentId !== config.experimentId) {
    throw new Error("input freeze experimentId does not match config");
  }
  if (inputFreeze?.status !== "post-evaluation-input-freeze") {
    throw new Error("input freeze status is invalid");
  }
  if (inputFreeze?.preregistrationCommit !== PREREGISTRATION_COMMIT) {
    throw new Error("input freeze preregistration commit does not match");
  }
  if (inputFreeze?.sourceCommit !== config.sourceCommit) {
    throw new Error("input freeze source commit does not match config");
  }
  if (
    inputFreeze?.claimScope !==
    "input-integrity-only; not prospective outcome preregistration"
  ) {
    throw new Error("input freeze claim scope is invalid");
  }
  for (const [key, value] of Object.entries(actual)) {
    if (inputFreeze?.expected?.[key] !== value) {
      throw new Error(
        `input freeze ${key} changed: ${value} != ` +
        inputFreeze?.expected?.[key]
      );
    }
  }
  return actual;
}

function baselineIdentity(replayRows, baselineProfile, config) {
  let matchedBoatCount = 0;
  let matchedRankCount = 0;
  let arrayOrderMatchedRaceCount = 0;
  let totalRankMatchedRaceCount = 0;
  let aiRankMatchedRaceCount = 0;
  const mismatches = [];
  const rankMismatches = [];

  for (const row of replayRows) {
    const ranked = scoreAb.rankAnalyses(row.analyses, baselineProfile, config);
    const rankedBoatOrder = ranked.map(analysis => analysis.boatNo);
    const savedArrayOrder = row.analyses.map(analysis => analysis.boatNo);
    if (JSON.stringify(rankedBoatOrder) === JSON.stringify(savedArrayOrder)) {
      arrayOrderMatchedRaceCount += 1;
    }
    const rankByBoat = new Map(
      ranked.map((analysis, index) => [analysis.boatNo, index + 1])
    );
    const productionTotalRankByBoat = new Map(
      row.analyses
        .map(analysis => scoreAb.scoreAnalysis(
          analysis,
          baselineProfile,
          config
        ))
        .sort((left, right) =>
          right.total - left.total || left.boatNo - right.boatNo
        )
        .map((analysis, index) => [analysis.boatNo, index + 1])
    );
    if (row.analyses.every(analysis =>
      Number(analysis.totalRank) ===
        productionTotalRankByBoat.get(analysis.boatNo)
    )) {
      totalRankMatchedRaceCount += 1;
    }
    if (row.analyses.every(analysis =>
      Number(analysis.aiRank) === rankByBoat.get(analysis.boatNo)
    )) {
      aiRankMatchedRaceCount += 1;
    }
    for (const analysis of row.analyses) {
      const scored = scoreAb.scoreAnalysis(analysis, baselineProfile, config);
      const storedTotal = Number(analysis.indexes.total);
      if (Object.is(scored.total, storedTotal) || scored.total === storedTotal) {
        matchedBoatCount += 1;
      } else {
        mismatches.push({
          raceKey: row.raceKey,
          boatNo: analysis.boatNo,
          storedTotal,
          recomputedTotal: scored.total
        });
      }
      const storedRank = Number(analysis.totalRank);
      const recomputedRank = productionTotalRankByBoat.get(analysis.boatNo);
      if (storedRank === recomputedRank) {
        matchedRankCount += 1;
      } else {
        rankMismatches.push({
          raceKey: row.raceKey,
          boatNo: analysis.boatNo,
          storedRank,
          recomputedRank
        });
      }
    }
  }

  const expectedBoatCount = config.cohort.expectedReplayBasisBoatCount;
  return {
    exact:
      matchedBoatCount === expectedBoatCount &&
      mismatches.length === 0 &&
      arrayOrderMatchedRaceCount === replayRows.length &&
      totalRankMatchedRaceCount === replayRows.length &&
      aiRankMatchedRaceCount === replayRows.length,
    expectedBoatCount,
    comparedBoatCount: matchedBoatCount + mismatches.length,
    matchedBoatCount,
    mismatchedBoatCount: mismatches.length,
    scoreIdentity: `${matchedBoatCount}/${expectedBoatCount}`,
    rankComparedBoatCount: matchedRankCount + rankMismatches.length,
    rankMatchedBoatCount: matchedRankCount,
    rankMismatchedBoatCount: rankMismatches.length,
    orderingIdentity: {
      expectedRaceCount: replayRows.length,
      arrayOrderMatchedRaceCount,
      arrayOrderIdentity:
        `${arrayOrderMatchedRaceCount}/${replayRows.length}`,
      totalRankMatchedRaceCount,
      totalRankIdentity:
        `${totalRankMatchedRaceCount}/${replayRows.length}`,
      aiRankMatchedRaceCount,
      aiRankIdentity:
        `${aiRankMatchedRaceCount}/${replayRows.length}`,
      exact:
        arrayOrderMatchedRaceCount === replayRows.length &&
        totalRankMatchedRaceCount === replayRows.length &&
        aiRankMatchedRaceCount === replayRows.length
    },
    mismatchExamples: mismatches.slice(0, 10),
    rankMismatchExamples: rankMismatches.slice(0, 10)
  };
}

function evaluateProfile(rows, profile, config) {
  const pairedRows = rows.map(row => scoreAb.compareRace({
    raceKey: row.raceKey,
    date: row.date,
    selectedAt: row.selectedAt,
    analyses: row.analyses,
    winnerBoatNo: row.winnerBoatNo,
    finishOrder: row.finishOrder
  }, profile, config));
  return {
    candidateId: profile.id,
    pairedRows,
    summary: scoreAb.summarizePaired(pairedRows)
  };
}

function discoveryEvaluation(rows, config) {
  const candidates = config.profiles.filter(profile => profile.kind === "candidate");
  const evaluations = candidates.map(profile =>
    evaluateProfile(rows, profile, config)
  );
  const candidateSummaries = evaluations.map(evaluation => ({
    candidateId: evaluation.candidateId,
    ...evaluation.summary
  }));
  const selection = scoreAb.selectDiscoveryCandidate(candidateSummaries, config);
  return { evaluations, candidateSummaries, selection };
}

function scoreChangeSummary(pairedRows = []) {
  let changedBoatCount = 0;
  let changedRaceCount = 0;
  let topBoatChangedRaceCount = 0;
  let absoluteScoreDeltaTotal = 0;
  let maximumAbsoluteScoreDelta = 0;

  for (const row of pairedRows) {
    const aByBoat = new Map(
      (row?.a?.ranking || []).map(boat => [Number(boat.boatNo), boat])
    );
    let raceChanged = false;
    for (const boat of row?.b?.ranking || []) {
      const a = aByBoat.get(Number(boat.boatNo));
      if (!a) throw new Error(`A/B ranking boat mismatch: ${row.raceKey}`);
      const absoluteDelta = Math.abs(Number(boat.total) - Number(a.total));
      absoluteScoreDeltaTotal += absoluteDelta;
      maximumAbsoluteScoreDelta = Math.max(
        maximumAbsoluteScoreDelta,
        absoluteDelta
      );
      if (absoluteDelta > 1e-12) {
        changedBoatCount += 1;
        raceChanged = true;
      }
    }
    if (raceChanged) changedRaceCount += 1;
    if (Number(row?.a?.topBoatNo) !== Number(row?.b?.topBoatNo)) {
      topBoatChangedRaceCount += 1;
    }
  }

  const comparedBoatCount = pairedRows.reduce(
    (sum, row) => sum + (row?.b?.ranking || []).length,
    0
  );
  const rounded = value => Number(value.toFixed(12));
  return {
    comparedRaceCount: pairedRows.length,
    comparedBoatCount,
    changedBoatCount,
    changedRaceCount,
    rankingChangedRaceCount: pairedRows.filter(row =>
      JSON.stringify(row?.a?.ranking?.map(boat => boat.boatNo) || []) !==
      JSON.stringify(row?.b?.ranking?.map(boat => boat.boatNo) || [])
    ).length,
    topBoatChangedRaceCount,
    meanAbsoluteScoreDelta: comparedBoatCount
      ? rounded(absoluteScoreDeltaTotal / comparedBoatCount)
      : null,
    maximumAbsoluteScoreDelta: rounded(maximumAbsoluteScoreDelta)
  };
}

function selectedCandidateId(selection) {
  return String(
    selection?.selectedCandidateId ||
    selection?.candidateId ||
    selection?.selected?.candidateId ||
    ""
  );
}

function holdoutGate(summary, config) {
  const evaluated = scoreAb.evaluateSealedHoldout(summary, config);
  return {
    ...evaluated,
    selectedCandidateOnly: true,
    oneSidedExactPValue: summary.oneSidedExactPValue,
    maximumOneSidedExactPValue:
      config.sealedHoldoutGate.maximumOneSidedExactPValue,
    chronologicalHalves: summary.chronologicalHalves
  };
}

function reportRows(evaluation) {
  return {
    candidateId: evaluation.candidateId,
    summary: evaluation.summary,
    scoreChange: scoreChangeSummary(evaluation.pairedRows),
    pairedRowFingerprint: scoreAb.cohortFingerprint(evaluation.pairedRows)
  };
}

function formalPairwiseProtocol(discoveryRows, holdoutRows, discovery, holdout) {
  const pairsPerRace = 3;
  const discoveryComparablePairCount = discoveryRows.length * pairsPerRace;
  const holdoutComparablePairCount = holdoutRows.length * pairsPerRace;
  for (const evaluation of discovery.evaluations) {
    if (
      evaluation.summary.pairwiseFinishOrderComparable !==
      discoveryComparablePairCount
    ) {
      throw new Error(
        `${evaluation.candidateId} discovery pairwise cohort is not exact`
      );
    }
  }
  if (
    holdout &&
    holdout.summary.pairwiseFinishOrderComparable !==
      holdoutComparablePairCount
  ) {
    throw new Error("selected holdout pairwise cohort is not exact");
  }
  return {
    officialFinishersPerRace: 3,
    pairsPerRace,
    discovery: {
      comparablePairCount: discoveryComparablePairCount,
      exact: true
    },
    holdout: {
      expectedComparablePairCount: holdoutComparablePairCount,
      evaluatedComparablePairCount: holdout
        ? holdout.summary.pairwiseFinishOrderComparable
        : null,
      exact: holdout ? true : null,
      status: holdout ? "evaluated-selected-candidate" : "not-evaluated-sealed"
    }
  };
}

function chronologicalHalfRaceCounts(raceCount) {
  const first = Math.floor(raceCount / 2);
  return [first, raceCount - first];
}

function buildReport(options = {}) {
  const root = options.root || ROOT;
  const configPath = options.configPath ||
    (root === ROOT
      ? CONFIG_PATH
      : path.join(root, "config", "effective-score-weight-ab-v1.json"));
  const rawConfig = readJson(configPath);
  const config = scoreAb.validateConfig(rawConfig);
  const inputFreezePath = options.inputFreezePath ||
    (root === ROOT
      ? INPUT_FREEZE_PATH
      : path.join(
        root,
        "config",
        "effective-score-weight-ab-input-freeze-v1.json"
      ));
  const inputFreeze = readJson(inputFreezePath);
  const replay = collectReplayBasisCohort({
    root,
    config,
    predictionsDir: options.predictionsDir
  });
  const settled = joinOfficialResults(replay.rows, {
    root,
    config,
    resultsDir: options.resultsDir
  });
  validateExpectedCohort(config, replay, settled);
  const frozenCohort = validateInputFreeze(
    config,
    inputFreeze,
    inputFreezeActual(replay, settled)
  );

  const baseline = scoreAb.profileById(config, "p0-current");
  const identity = baselineIdentity(replay.rows, baseline, config);
  if (!identity.exact) {
    throw new Error(
      `baseline identity failed: ${identity.scoreIdentity}`
    );
  }

  const discoveryDates = new Set(config.cohort.discoveryDates);
  const holdoutDates = new Set(config.cohort.holdoutDates);
  const discoveryRows = settled.rows.filter(row => discoveryDates.has(row.date));
  const holdoutRows = settled.rows.filter(row => holdoutDates.has(row.date));
  const discovery = discoveryEvaluation(discoveryRows, config);
  const fixedCandidateId = selectedCandidateId(discovery.selection);
  const fixedCandidate = fixedCandidateId
    ? scoreAb.profileById(config, fixedCandidateId)
    : null;

  // The sealed holdout is deliberately not mapped across every candidate.
  // Only the single candidate fixed by discovery can enter this branch.
  const holdoutEvaluation = fixedCandidate
    ? evaluateProfile(holdoutRows, fixedCandidate, config)
    : null;
  const gate = holdoutEvaluation
    ? holdoutGate(
      holdoutEvaluation.summary,
      config
    )
    : null;
  const pairwiseProtocol = formalPairwiseProtocol(
    discoveryRows,
    holdoutRows,
    discovery,
    holdoutEvaluation
  );

  const settledNewEnvironmentActiveRows = settled.rows.filter(
    row => row.newEnvironmentMode === true
  );
  const settledNewEnvironmentExplicitFalseRows = settled.rows.filter(
    row => row.newEnvironmentMode === false
  );
  const source = fs.readFileSync(
    options.aiCorePath ||
      (root === ROOT ? AI_CORE_PATH : path.join(root, "js", "ai-core.js")),
    "utf8"
  );
  const formulaSource = productionFormulaSource(source);
  const formulaWeights = productionFormulaWeights(formulaSource, baseline);
  const minimumNewEnvironmentRaces =
    config.newEnvironmentGate.minimumProspectiveActiveRaceCount;
  const newEnvironmentEvidenceSufficient =
    settledNewEnvironmentActiveRows.length >= minimumNewEnvironmentRaces;
  const newEnvironmentDecision = newEnvironmentEvidenceSufficient
    ? "not-evaluated-separate-prospective-half-gate"
    : settledNewEnvironmentActiveRows.length === 0
      ? config.newEnvironmentGate.whenNoActiveRaceEvidence
      : "blocked-insufficient-active-new-environment-evidence";
  const scoreOnlyDecision = !fixedCandidate
    ? "rejected-no-discovery-candidate"
    : gate?.passed === true
      ? config.sealedHoldoutGate.maximumDecision
      : "rejected-by-sealed-holdout";
  const productionDecision = !fixedCandidate
    ? "rejected-no-discovery-candidate"
    : gate?.passed !== true
      ? "rejected-by-sealed-holdout"
    : !newEnvironmentEvidenceSufficient
      ? newEnvironmentDecision
      : "blocked-pending-separate-prospective-new-environment-half-gate";

  return {
    schemaVersion: 1,
    experimentId: config.experimentId,
    status: config.status,
    generatedAt: config.frozenAt,
    generationTimestampPolicy:
      "config.frozenAt is used so the fixed report is byte-reproducible",
    preregistration: {
      commit: PREREGISTRATION_COMMIT,
      configFrozenAt: config.frozenAt,
      sourceCommit: config.sourceCommit,
      candidatesFixedBeforeOfficialOutcomeEvaluation: true,
      claimScope: "procedural evaluation order only",
      prospectiveAtOfficialOutcomeTime: false
    },
    inputFreeze: {
      commit: INPUT_FREEZE_COMMIT,
      createdAt: inputFreeze.createdAt,
      status: inputFreeze.status,
      claimScope: inputFreeze.claimScope,
      anchoredAfterProceduralEvaluation: true
    },
    fingerprints: {
      config: scoreAb.configFingerprint(config),
      productionFormulaSource: sha256Text(formulaSource),
      productionFormulaSemantic: scoreAb.formulaFingerprint(config, baseline),
      replayBasisCohort: frozenCohort.replayBasisCohortFingerprint,
      settledEvaluationCohort:
        frozenCohort.settledEvaluationCohortFingerprint
    },
    target: {
      file: config.target.file,
      scope: config.target.scope,
      baselineProfileId: baseline.id,
      componentOrder: config.target.componentOrder,
      rankingProtocols: {
        scoreAbAndAiRank: config.target.rankingTieBreak,
        storedArrayOrder: config.target.rankingTieBreak,
        productionTotalRank: ["total-desc", "boatNo-asc"]
      },
      componentMapping: {
        raceFlow: "replayBasis.analyses[].indexes.raceFlow",
        courseIndex:
          "replayBasis.analyses[].courseStructureTheory.appliedIndex " +
          "(course composite including legacy compatibility offset)",
        roleAttack: "replayBasis.analyses[].roleScores.attack",
        st: "replayBasis.analyses[].indexes.st",
        exhibition: "replayBasis.analyses[].indexes.exhibition",
        roleHold: "replayBasis.analyses[].roleScores.hold",
        rolePickup: "replayBasis.analyses[].roleScores.pickup",
        local: "replayBasis.analyses[].indexes.local",
        turn: "replayBasis.analyses[].indexes.turn",
        national: "replayBasis.analyses[].indexes.national",
        motor: "replayBasis.analyses[].indexes.motor"
      },
      formulaSource,
      productionFormulaWeights: formulaWeights,
      p3CoupledEffect:
        "ST is strengthened directly and indirectly through the composite " +
        "roleAttack component",
      futureCourseOffsetSeparation:
        "out of scope; separating the legacy compatibility offset would be " +
        "a different formula and experiment"
    },
    profiles: config.profiles.map(profile => ({
      id: profile.id,
      kind: profile.kind,
      hypothesis: profile.hypothesis,
      weights: profile.weights,
      l1DistanceFromBaseline: Number(
        scoreAb.profileDistance(baseline, profile).toFixed(12)
      )
    })),
    analysisInput: {
      contract: ANALYSIS_INPUT_CONTRACT,
      predictionSource: config.cohort.predictionSource,
      resultSource: config.cohort.resultSource,
      replayBasisPath: config.cohort.replayBasisPath,
      replayBasisSource: config.cohort.replayBasisSource,
      canonicalDeduplication: config.cohort.canonicalDeduplication,
      retrospectiveBackfillAllowed: config.cohort.retrospectiveBackfillAllowed,
      diagnostics: replay.diagnostics,
      officialJoin: settled.diagnostics
    },
    evaluationProtocol: {
      discovery:
        "evaluate every preregistered candidate, then fix at most one",
      sealedHoldout:
        "evaluate only the single candidate fixed by discovery",
      holdoutType:
        "retrospective temporal holdout with procedural seal; not " +
        "outcome-time prospective",
      pairwiseFinishOrder:
        "analysis-input-contract.finishOrder official top three only; " +
        "three pairwise order comparisons per settled race",
      pairwise: pairwiseProtocol,
      chronologicalHalves:
        "equal-race-count chronological halves; odd cohorts put floor(n/2) " +
        "races in the first half and the remainder in the second",
      resultDataUsedForScoring: false,
      officialResultEvaluationRunsAfterCandidateProfilesWerePreregistered:
        true
    },
    cohort: {
      replayBasis: {
        raceCount: replay.rows.length,
        boatCount: replay.rows.reduce(
          (sum, row) => sum + row.analyses.length,
          0
        ),
        expectedRaceCount: config.cohort.expectedReplayBasisRaceCount,
        expectedBoatCount: config.cohort.expectedReplayBasisBoatCount,
        exact: true
      },
      settled: {
        raceCount: settled.rows.length,
        boatCount: settled.rows.reduce(
          (sum, row) => sum + row.analyses.length,
          0
        ),
        expectedRaceCount: config.cohort.expectedSettledRaceCount,
        exact: true
      },
      discovery: {
        dates: config.cohort.discoveryDates,
        raceCount: discoveryRows.length,
        chronologicalHalfRaceCounts:
          chronologicalHalfRaceCounts(discoveryRows.length)
      },
      holdout: {
        dates: config.cohort.holdoutDates,
        raceCount: holdoutRows.length,
        chronologicalHalfRaceCounts:
          chronologicalHalfRaceCounts(holdoutRows.length),
        sealedUntilDiscoverySelection: true
      },
      newEnvironment: {
        evaluatedSettledRaceCount: settled.rows.length,
        activeRaceCount: settledNewEnvironmentActiveRows.length,
        explicitFalseRaceCount:
          settledNewEnvironmentExplicitFalseRows.length,
        unknownModeRaceCount:
          settled.rows.length -
          settledNewEnvironmentActiveRows.length -
          settledNewEnvironmentExplicitFalseRows.length,
        modeSource: "prediction.preRaceConditions.newEngineMode",
        venueNameInferenceAllowed: false,
        requiredProspectiveActiveRaceCount:
          minimumNewEnvironmentRaces,
        minimumProspectiveActiveRaceCountSatisfied:
          newEnvironmentEvidenceSufficient,
        firstAndSecondHalfMustBeNonHarmful:
          config.newEnvironmentGate.firstAndSecondHalfMustBeNonHarmful,
        firstAndSecondHalfGate:
          "not-evaluated-separate-prospective-gate",
        gateDecision: newEnvironmentDecision
      }
    },
    baselineIdentity: identity,
    discovery: {
      evaluatedCandidateIds: discovery.evaluations.map(item => item.candidateId),
      evaluatedAllPreregisteredCandidates:
        discovery.evaluations.length ===
        config.profiles.filter(profile => profile.kind === "candidate").length,
      candidates: discovery.evaluations.map(reportRows),
      selection: discovery.selection,
      fixedCandidateId: fixedCandidateId || null
    },
    holdout: {
      opened: Boolean(holdoutEvaluation),
      evaluatedSelectedCandidateOnly: true,
      evaluatedCandidateIds: holdoutEvaluation
        ? [holdoutEvaluation.candidateId]
        : [],
      candidate: holdoutEvaluation ? reportRows(holdoutEvaluation) : null,
      scoreChange: holdoutEvaluation
        ? scoreChangeSummary(holdoutEvaluation.pairedRows)
        : null,
      gate,
      notEvaluatedReason: holdoutEvaluation
        ? null
        : "no discovery candidate; sealed holdout was not opened"
    },
    downstreamImpact: {
      formal: false,
      scope: "saved-component score-and-ranking sensitivity only",
      scoreAndRankingMeasured: true,
      scenariosReplayed: false,
      marksReplayed: false,
      selectionsReplayed: false,
      ticketsReplayed: false,
      downstreamClaimsAllowed: false,
      reason:
        "Changing total scores can feed scenarios, marks, selection, and " +
        "tickets in production, but this saved replay basis cannot formally " +
        "reconstruct those downstream decisions after rescoring."
    },
    decision: {
      scoreOnlyHoldoutPassed: gate?.passed === true,
      scoreOnlyDecision,
      productionDecision,
      maximumDecision: config.sealedHoldoutGate.maximumDecision,
      productionApplicationAllowed: false,
      prospectiveNewEnvironmentGateRequired: true
    },
    limitations: {
      temporalHoldout:
        "retrospective temporal holdout with a procedural seal; not " +
        "outcome-time prospective evidence",
      sourceCommitAlreadyContainedOfficialHoldoutResults: true,
      newEnvironmentMode:
        "the saved preRaceConditions.newEngineMode boolean is canonical for " +
        "this fixed report; future mode must not be statically re-inferred " +
        "from venue names",
      newEnvironmentProspectiveGate:
        "a separate 100-race active cohort with non-harmful first and second " +
        "halves has not been constructed",
      courseIndex:
        "the course component includes the legacy compatibility offset; " +
        "offset separation is outside this A/B"
    },
    safety: {
      ...config.safety,
      productionChanged: false,
      automaticApplication: false,
      usableForPrediction: false,
      runtimeImportAllowed: false,
      downstreamScenarioMarksTicketsClaimAllowed: false
    }
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
      "effective score weight A/B report is stale; run " +
      "node scripts/build-effective-score-weight-ab-report.js"
    );
  }
}

function main() {
  const report = buildReport();
  if (process.argv.includes("--check")) {
    checkReport(report);
    console.log("effective score weight A/B report is reproducible");
    return;
  }
  writeReport(report);
  console.log(
    `effective score weight A/B: ${report.cohort.replayBasis.raceCount} ` +
    `replay races / ${report.cohort.settled.raceCount} settled races / ` +
    `${report.discovery.fixedCandidateId || "no candidate"}`
  );
}

if (require.main === module) main();

module.exports = {
  ANALYSIS_INPUT_CONTRACT,
  INPUT_FREEZE_COMMIT,
  PREREGISTRATION_COMMIT,
  baselineIdentity,
  buildReport,
  checkReport,
  collectReplayBasisCohort,
  configuredWindow,
  formalPairwiseProtocol,
  holdoutGate,
  joinOfficialResults,
  inputFreezeActual,
  parseTimestamp,
  predictionFilesInWindow,
  productionFormulaSource,
  productionFormulaWeights,
  serialize,
  scoreChangeSummary,
  snapshotAnalysis,
  validateExpectedCohort,
  validateInputFreeze,
  writeReport
};
