"use strict";

const fs = require("node:fs");
const path = require("node:path");
const localWater = require("./build-local-water-result-breakdown");
const bottleneck = require("./build-local-water-outer-head-bottleneck-audit");
const selection = require("./build-local-water-priority-selection-consistency-audit");

const ROOT = path.resolve(__dirname, "..");
const INPUT = path.join(
  ROOT,
  "data",
  "stats",
  "local-water-priority-selection-consistency-audit.json"
);
const OUTPUT = path.join(
  ROOT,
  "data",
  "stats",
  "local-water-priority-selector-shadow-replay.json"
);
const CANDIDATE_PATH = "practicalSelection.frameRiseFallReplayBasis.raceScenarios.mainScenario.branches";
const EXPECTED_SOURCE_VERSION = "local-water-priority-selection-consistency-audit-v1";
const EXPECTED_SOURCE_NEXT_STEP = "build-local-water-priority-selector-shadow-replay";

const FIXED_RULES = Object.freeze({
  minimumSettledFormalRaceCount: 300,
  minimumCurrentHeadCoverageRate: 90,
  minimumComparableReplayCount: 100,
  minimumComparableReplayCoverageRate: 50,
  minimumSwitchCount: 2,
  minimumNetCorrectGain: 2,
  minimumOuterWinnerRescueCount: 2,
  maximumCorrectToWrongCount: 0,
  maximumFalseOuterPromotionsPerRescue: 3,
  maximumOuterPromotionRaceRate: 10,
  minimumConditionBandCount: 30,
  maximumConditionBandAccuracyDeclinePt: 2
});

const arr = (value) => Array.isArray(value) ? value : [];

function round1(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function rate(count, total) {
  return total > 0 ? round1(Number(count || 0) / total * 100) : null;
}

function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function raceKey(row = {}) {
  return `${row.date}-${String(row.jcd || "").padStart(2, "0")}-${Number(row.raceNo || 0)}`;
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (_error) {
    return fallback;
  }
}

function loadDaily(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => /^\d{8}\.json$/.test(name))
    .sort()
    .map((name) => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")));
}

function predictionRows(docs) {
  const map = new Map();
  for (const doc of arr(docs)) {
    for (const source of ["predictions", "verificationPredictions"]) {
      for (const row of arr(doc?.[source])) {
        const key = raceKey(row);
        if (source === "predictions" || !map.has(key)) map.set(key, row);
      }
    }
  }
  return [...map.values()];
}

function resultMap(docs) {
  const map = new Map();
  for (const doc of arr(docs)) {
    for (const race of arr(doc?.races)) {
      if (race?.resultAvailable === true && race?.status === "finished") {
        map.set(raceKey(race), race);
      }
    }
  }
  return map;
}

function increment(map, value) {
  const key = String(value ?? "unknown");
  map.set(key, (map.get(key) || 0) + 1);
}

function sortedObject(map) {
  return Object.fromEntries(
    [...map.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
  );
}

function candidateRanking(prediction = {}) {
  const rawRows = selection.valueAtPath(prediction, CANDIDATE_PATH);
  if (!Array.isArray(rawRows)) {
    return {
      available: false,
      rawRowCount: 0,
      candidates: [],
      byBoat: new Map(),
      best: null
    };
  }

  const byBoat = new Map();
  rawRows.forEach((row, index) => {
    const score = selection.priorityScore(row);
    if (!Number.isFinite(score)) return;
    for (const boatNo of selection.headBoats(row)) {
      const existing = byBoat.get(boatNo);
      const candidate = {
        boatNo,
        score,
        index,
        role: selection.roleClass(row),
        ticket: String(row?.ticket || row?.combination || row?.formation || "")
      };
      if (
        !existing ||
        candidate.score > existing.score ||
        (candidate.score === existing.score && candidate.index < existing.index)
      ) {
        byBoat.set(boatNo, candidate);
      }
    }
  });

  const candidates = [...byBoat.values()].sort((left, right) =>
    right.score - left.score || left.index - right.index || left.boatNo - right.boatNo
  );
  return {
    available: true,
    rawRowCount: rawRows.length,
    candidates,
    byBoat,
    best: candidates[0] || null
  };
}

function replayRace(record, result) {
  const evidence = localWater.evidence(record);
  const actualHead = localWater.actualHead(result);
  const currentHead = localWater.predictedHead(record);
  const ranking = candidateRanking(record?.prediction || {});
  const currentCandidate = currentHead ? ranking.byBoat.get(currentHead) || null : null;
  const comparable = Boolean(
    actualHead &&
    currentHead &&
    ranking.best &&
    currentCandidate &&
    Number.isFinite(ranking.best.score) &&
    Number.isFinite(currentCandidate.score)
  );

  let shadowHead = currentHead;
  let switched = false;
  let switchReason = comparable ? "no-strict-score-improvement" : "not-comparable";
  if (comparable && ranking.best.score > currentCandidate.score) {
    shadowHead = ranking.best.boatNo;
    switched = shadowHead !== currentHead;
    switchReason = switched
      ? "strictly-higher-priority-score"
      : "best-candidate-is-current-head";
  }

  const currentCorrect = Boolean(currentHead && currentHead === actualHead);
  const shadowCorrect = Boolean(shadowHead && shadowHead === actualHead);
  let outcome = currentCorrect ? "unchanged-correct" : "unchanged-wrong";
  if (switched && !currentCorrect && shadowCorrect) outcome = "wrong-to-correct";
  else if (switched && currentCorrect && !shadowCorrect) outcome = "correct-to-wrong";
  else if (switched && !currentCorrect && !shadowCorrect) outcome = "wrong-to-wrong";

  const equalTopOtherBoat = Boolean(
    comparable &&
    ranking.candidates.some((candidate) =>
      candidate.boatNo !== currentHead && candidate.score === currentCandidate.score
    )
  );
  const actualOuter = actualHead === 5 || actualHead === 6;
  const shadowOuterPromotion = Boolean(switched && (shadowHead === 5 || shadowHead === 6));
  const rescuedOuterWinner = Boolean(
    switched && !currentCorrect && shadowCorrect && actualOuter
  );
  const lostOuterWinner = Boolean(
    switched && currentCorrect && !shadowCorrect && actualOuter
  );
  const falseOuterPromotion = Boolean(
    shadowOuterPromotion && shadowHead !== actualHead
  );

  return {
    date: record.date,
    jcd: String(record.jcd || "").padStart(2, "0"),
    raceNo: Number(record.raceNo || 0),
    venue: evidence.venue || "",
    wind: evidence.wind,
    wave: evidence.wave,
    conditionBand: bottleneck.conditionBand(evidence),
    actualHead,
    currentHead,
    shadowHead,
    currentCorrect,
    shadowCorrect,
    comparable,
    rankingArrayAvailable: ranking.available,
    rawCandidateRowCount: ranking.rawRowCount,
    candidateBoatCount: ranking.candidates.length,
    currentScore: currentCandidate?.score ?? null,
    bestCandidateBoat: ranking.best?.boatNo ?? null,
    bestCandidateScore: ranking.best?.score ?? null,
    scoreImprovement: comparable
      ? round1(ranking.best.score - currentCandidate.score)
      : null,
    equalTopOtherBoat,
    switched,
    switchReason,
    outcome,
    actualOuter,
    shadowOuterPromotion,
    rescuedOuterWinner,
    lostOuterWinner,
    falseOuterPromotion,
    topCandidates: ranking.candidates.slice(0, 6)
  };
}

function emptyBand(name) {
  return {
    conditionBand: name,
    raceCount: 0,
    comparableReplayCount: 0,
    switchCount: 0,
    currentCorrectCount: 0,
    shadowCorrectCount: 0,
    wrongToCorrectCount: 0,
    correctToWrongCount: 0,
    rescuedOuterWinnerCount: 0,
    falseOuterPromotionCount: 0
  };
}

function finalizeBand(row) {
  const currentAccuracy = rate(row.currentCorrectCount, row.raceCount);
  const shadowAccuracy = rate(row.shadowCorrectCount, row.raceCount);
  return {
    ...row,
    currentAccuracy,
    shadowAccuracy,
    accuracyChangePt: currentAccuracy === null || shadowAccuracy === null
      ? null
      : round1(shadowAccuracy - currentAccuracy),
    comparableReplayCoverageRate: rate(row.comparableReplayCount, row.raceCount),
    switchRate: rate(row.switchCount, row.raceCount)
  };
}

function harmfulConditionBands(conditionBands = []) {
  return arr(conditionBands).filter((row) =>
    Number(row.raceCount || 0) >= FIXED_RULES.minimumConditionBandCount &&
    Number(row.accuracyChangePt || 0) < -FIXED_RULES.maximumConditionBandAccuracyDeclinePt
  );
}

function decideNextStep({ applicable, metrics, conditionBands }) {
  if (!applicable) {
    return {
      nextStep: "follow-priority-selection-consistency-next-step",
      reason: "上流の固定nextStepがshadow replayではないため、この反実仮想は適用しない。"
    };
  }
  if (metrics.settledFormalEvidenceRaceCount < FIXED_RULES.minimumSettledFormalRaceCount) {
    return {
      nextStep: "continue-collecting-local-water-priority-selector-evidence",
      reason: `当地・水面確定群${metrics.settledFormalEvidenceRaceCount}Rで、固定した${FIXED_RULES.minimumSettledFormalRaceCount}R未満。`
    };
  }
  if (metrics.currentHeadCoverageRate < FIXED_RULES.minimumCurrentHeadCoverageRate) {
    return {
      nextStep: "improve-current-head-observability-before-shadow-replay",
      reason: `現行頭の取得率${metrics.currentHeadCoverageRate}%で、固定した${FIXED_RULES.minimumCurrentHeadCoverageRate}%未満。`
    };
  }
  if (
    metrics.comparableReplayCount < FIXED_RULES.minimumComparableReplayCount ||
    metrics.comparableReplayCoverageRate < FIXED_RULES.minimumComparableReplayCoverageRate
  ) {
    return {
      nextStep: "improve-priority-selector-shadow-replay-observability",
      reason: `比較可能${metrics.comparableReplayCount}R・被覆${metrics.comparableReplayCoverageRate}%で、固定条件を満たさない。`
    };
  }
  if (metrics.switchCount < FIXED_RULES.minimumSwitchCount) {
    return {
      nextStep: "continue-collecting-priority-selector-switch-evidence",
      reason: `厳密なスコア上位への切替が${metrics.switchCount}Rで、固定した${FIXED_RULES.minimumSwitchCount}R未満。`
    };
  }

  const harmful = harmfulConditionBands(conditionBands);
  const falsePerRescue = metrics.falseOuterPromotionsPerRescuedOuterWinner;
  const passesSafety =
    metrics.netCorrectChange >= FIXED_RULES.minimumNetCorrectGain &&
    metrics.rescuedOuterWinnerCount >= FIXED_RULES.minimumOuterWinnerRescueCount &&
    metrics.correctToWrongCount <= FIXED_RULES.maximumCorrectToWrongCount &&
    Number.isFinite(falsePerRescue) &&
    falsePerRescue <= FIXED_RULES.maximumFalseOuterPromotionsPerRescue &&
    metrics.outerPromotionRaceRate <= FIXED_RULES.maximumOuterPromotionRaceRate &&
    harmful.length === 0;

  if (passesSafety) {
    return {
      nextStep: "prepare-local-water-priority-selector-forward-shadow-ab",
      reason: `全体純増${metrics.netCorrectChange}R、5・6号艇救済${metrics.rescuedOuterWinnerCount}R、正解→不正解${metrics.correctToWrongCount}Rで、固定安全条件を全て満たした。`
    };
  }
  if (
    metrics.netCorrectChange < 0 ||
    metrics.correctToWrongCount > metrics.wrongToCorrectCount ||
    metrics.accuracyChangePt < 0
  ) {
    return {
      nextStep: "reject-local-water-priority-selector-shadow-rule",
      reason: `純増${metrics.netCorrectChange}R・正解→不正解${metrics.correctToWrongCount}Rで、全体精度の安全条件を満たさない。`
    };
  }
  if (harmful.length > 0) {
    return {
      nextStep: "audit-local-water-priority-selector-condition-harm",
      reason: `固定件数以上の水面条件で${FIXED_RULES.maximumConditionBandAccuracyDeclinePt}pt超の悪化がある。`
    };
  }
  if (
    metrics.rescuedOuterWinnerCount < FIXED_RULES.minimumOuterWinnerRescueCount ||
    metrics.netCorrectChange < FIXED_RULES.minimumNetCorrectGain
  ) {
    return {
      nextStep: "continue-collecting-local-water-priority-selector-shadow-evidence",
      reason: `純増${metrics.netCorrectChange}R・5・6号艇救済${metrics.rescuedOuterWinnerCount}Rで、採用候補の固定最低値に未到達。`
    };
  }
  if (
    !Number.isFinite(falsePerRescue) ||
    falsePerRescue > FIXED_RULES.maximumFalseOuterPromotionsPerRescue ||
    metrics.outerPromotionRaceRate > FIXED_RULES.maximumOuterPromotionRaceRate
  ) {
    return {
      nextStep: "reject-local-water-priority-selector-outer-promotion-risk",
      reason: `誤外枠昇格/救済${falsePerRescue}件・外枠昇格率${metrics.outerPromotionRaceRate}%で、固定上限を超えた。`
    };
  }
  return {
    nextStep: "continue-monitoring-local-water-priority-selector-shadow-replay",
    reason: "全体悪化はないが、前向きshadow A/Bへ進む固定条件を全ては満たさない。"
  };
}

function build(predictionDocs = [], resultDocs = [], sourceReport = {}) {
  const source = sourceReport && typeof sourceReport === "object" ? sourceReport : {};
  const applicable =
    source.version === EXPECTED_SOURCE_VERSION &&
    source.nextStep === EXPECTED_SOURCE_NEXT_STEP;
  const results = resultMap(resultDocs);
  const settled = predictionRows(predictionDocs)
    .map((record) => ({
      record,
      evidence: localWater.evidence(record),
      result: results.get(raceKey(record)) || null
    }))
    .filter((row) => row.evidence.formal && row.result && localWater.actualHead(row.result));

  const replays = settled.map((row) => replayRace(row.record, row.result));
  const currentRows = replays.filter((row) => row.currentHead);
  const comparableRows = currentRows.filter((row) => row.comparable);
  const switchedRows = currentRows.filter((row) => row.switched);
  const currentDistribution = new Map();
  const shadowDistribution = new Map();
  const actualDistribution = new Map();
  const transitions = new Map();
  const outcomes = new Map();
  const bands = new Map();

  for (const row of currentRows) {
    increment(currentDistribution, row.currentHead);
    increment(shadowDistribution, row.shadowHead);
    increment(actualDistribution, row.actualHead);
    increment(outcomes, row.outcome);
    if (row.switched) increment(transitions, `${row.currentHead}->${row.shadowHead}`);

    const name = row.conditionBand || "unknown";
    const band = bands.get(name) || emptyBand(name);
    band.raceCount++;
    if (row.comparable) band.comparableReplayCount++;
    if (row.switched) band.switchCount++;
    if (row.currentCorrect) band.currentCorrectCount++;
    if (row.shadowCorrect) band.shadowCorrectCount++;
    if (row.outcome === "wrong-to-correct") band.wrongToCorrectCount++;
    if (row.outcome === "correct-to-wrong") band.correctToWrongCount++;
    if (row.rescuedOuterWinner) band.rescuedOuterWinnerCount++;
    if (row.falseOuterPromotion) band.falseOuterPromotionCount++;
    bands.set(name, band);
  }

  const conditionBands = [...bands.values()]
    .map(finalizeBand)
    .sort((left, right) => right.raceCount - left.raceCount || left.conditionBand.localeCompare(right.conditionBand));
  const currentCorrectCount = currentRows.filter((row) => row.currentCorrect).length;
  const shadowCorrectCount = currentRows.filter((row) => row.shadowCorrect).length;
  const rescuedOuterWinnerCount = currentRows.filter((row) => row.rescuedOuterWinner).length;
  const falseOuterPromotionCount = currentRows.filter((row) => row.falseOuterPromotion).length;
  const currentAccuracy = rate(currentCorrectCount, currentRows.length);
  const shadowAccuracy = rate(shadowCorrectCount, currentRows.length);

  const metrics = {
    settledFormalEvidenceRaceCount: settled.length,
    currentHeadAvailableCount: currentRows.length,
    rankingArrayAvailableCount: currentRows.filter((row) => row.rankingArrayAvailable).length,
    currentCandidateScoreAvailableCount: currentRows.filter((row) => row.currentScore !== null).length,
    comparableReplayCount: comparableRows.length,
    switchCount: switchedRows.length,
    equalTopOtherBoatNoSwitchCount: comparableRows.filter((row) => row.equalTopOtherBoat && !row.switched).length,
    currentCorrectCount,
    shadowCorrectCount,
    netCorrectChange: shadowCorrectCount - currentCorrectCount,
    wrongToCorrectCount: currentRows.filter((row) => row.outcome === "wrong-to-correct").length,
    correctToWrongCount: currentRows.filter((row) => row.outcome === "correct-to-wrong").length,
    wrongToWrongChangedCount: currentRows.filter((row) => row.outcome === "wrong-to-wrong").length,
    actualOuterHeadCount: currentRows.filter((row) => row.actualOuter).length,
    currentOuterWinnerCorrectCount: currentRows.filter((row) => row.actualOuter && row.currentCorrect).length,
    shadowOuterWinnerCorrectCount: currentRows.filter((row) => row.actualOuter && row.shadowCorrect).length,
    rescuedOuterWinnerCount,
    lostOuterWinnerCount: currentRows.filter((row) => row.lostOuterWinner).length,
    outerPromotionSwitchCount: currentRows.filter((row) => row.shadowOuterPromotion).length,
    falseOuterPromotionCount,
    currentHeadCoverageRate: rate(currentRows.length, settled.length),
    rankingArrayCoverageRate: rate(currentRows.filter((row) => row.rankingArrayAvailable).length, settled.length),
    comparableReplayCoverageRate: rate(comparableRows.length, settled.length),
    switchRate: rate(switchedRows.length, currentRows.length),
    currentAccuracy,
    shadowAccuracy,
    accuracyChangePt: currentAccuracy === null || shadowAccuracy === null
      ? null
      : round1(shadowAccuracy - currentAccuracy),
    outerWinnerRescueRate: rate(rescuedOuterWinnerCount, currentRows.filter((row) => row.actualOuter).length),
    outerPromotionRaceRate: rate(currentRows.filter((row) => row.shadowOuterPromotion).length, currentRows.length),
    falseOuterPromotionsPerRescuedOuterWinner: rescuedOuterWinnerCount > 0
      ? round1(falseOuterPromotionCount / rescuedOuterWinnerCount)
      : null
  };

  const decision = decideNextStep({ applicable, metrics, conditionBands });
  return {
    schemaVersion: 1,
    version: "local-water-priority-selector-shadow-replay-v1",
    generatedAt: new Date().toISOString(),
    productionChanged: false,
    automaticApplication: false,
    usableForPrediction: false,
    methodology: "締切前保存済みの当地・水面正式証拠、現行最終頭、同一候補配列のpriorityScoreだけで反実仮想を作成。候補の最高点が現行頭より厳密に高い場合だけshadow頭へ切り替え、同点は現行頭を維持して公式結果と照合する。",
    sourceVersion: source.version || null,
    sourceGeneratedAt: source.generatedAt || null,
    sourceNextStep: source.nextStep || null,
    applicable,
    shadowRule: {
      id: "strict-higher-priority-score-stable-current-on-tie",
      candidatePath: CANDIDATE_PATH,
      switchCondition: "best priorityScore > current-head priorityScore",
      tieHandling: "keep current production head",
      resultUsedForSelection: false
    },
    fixedDecisionRules: FIXED_RULES,
    metrics,
    conditionBands,
    harmfulConditionBands: harmfulConditionBands(conditionBands),
    currentHeadDistribution: sortedObject(currentDistribution),
    shadowHeadDistribution: sortedObject(shadowDistribution),
    actualHeadDistribution: sortedObject(actualDistribution),
    switchTransitions: sortedObject(transitions),
    outcomeCounts: sortedObject(outcomes),
    nextStep: decision.nextStep,
    decisionReason: decision.reason,
    switchedRaces: switchedRows.sort((left, right) =>
      String(left.date).localeCompare(String(right.date)) ||
      left.jcd.localeCompare(right.jcd) ||
      left.raceNo - right.raceNo
    ),
    safety: {
      predictionLogicChanged: false,
      ticketsChanged: false,
      pointCountChanged: false,
      uiChanged: false,
      oddsUsed: false,
      payoutUsed: false,
      automaticAdoption: false
    }
  };
}

function main() {
  const report = build(
    loadDaily(path.join(ROOT, "data", "predictions")),
    loadDaily(path.join(ROOT, "data", "results")),
    readJson(INPUT, {})
  );
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    applicable: report.applicable,
    metrics: report.metrics,
    conditionBands: report.conditionBands,
    nextStep: report.nextStep,
    decisionReason: report.decisionReason
  }, null, 2));
}

if (require.main === module) main();
module.exports = {
  candidateRanking,
  replayRace,
  harmfulConditionBands,
  decideNextStep,
  build
};
