"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const INPUT = path.join(
  ROOT,
  "data",
  "stats",
  "local-water-outer-head-priority-score-audit.json"
);
const OUTPUT = path.join(
  ROOT,
  "data",
  "stats",
  "local-water-priority-selection-consistency-audit.json"
);

const EXPECTED_SOURCE_VERSION = "local-water-outer-head-priority-score-audit-v1";
const EXPECTED_SOURCE_NEXT_STEP = "audit-local-water-priority-selection-consistency";

const FIXED_RULES = Object.freeze({
  minimumTargetCount: 5,
  minimumResolvedPairCoverageRate: 80,
  strictInversionCountForShadowReplay: 2,
  duplicateShareForOrderAudit: 50,
  minimumTieCount: 5,
  tieOrderShareForAudit: 60,
  explicitRejectionCountForContractAudit: 5
});

const arr = (value) => Array.isArray(value) ? value : [];

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function round1(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function rate(count, total) {
  return total > 0 ? round1(Number(count || 0) / total * 100) : null;
}

function key(row = {}) {
  return `${row.date}-${String(row.jcd || "").padStart(2, "0")}-${Number(row.raceNo || 0)}`;
}

function loadJson(file, fallback = null) {
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
        const rowKey = key(row);
        if (source === "predictions" || !map.has(rowKey)) map.set(rowKey, row);
      }
    }
  }
  return map;
}

function boatNumber(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 6 ? number : null;
}

function objectBoatNumber(value = {}) {
  for (const field of [
    "boatNo",
    "boat",
    "number",
    "waku",
    "teiban",
    "targetBoatNo",
    "candidateBoatNo",
    "headBoatNo"
  ]) {
    const number = boatNumber(value?.[field]);
    if (number) return number;
  }
  return null;
}

function exactTicketHead(value) {
  if (value == null) return null;
  const text = String(value)
    .trim()
    .replace(/[＝=＞>]/g, "-")
    .replace(/\s+/g, "");
  const exact = text.match(/^([1-6])-([1-6])-([1-6])$/);
  if (exact && new Set(exact.slice(1).map(Number)).size === 3) {
    return Number(exact[1]);
  }
  const formation = text.match(/^([1-6])-(?:[1-6]{1,5}|全)-/);
  return formation ? Number(formation[1]) : null;
}

function roleText(row = {}) {
  return [
    row.role,
    row.roleIntent,
    row.type,
    row.category,
    ...arr(row.roleIntents),
    ...arr(row.roleLabels),
    ...arr(row.roles)
  ].filter(Boolean).map(String).join(" ").trim();
}

function headBoats(row = {}) {
  const heads = new Set();
  if (!row || typeof row !== "object" || Array.isArray(row)) return heads;

  for (const field of [
    "headBoatNo",
    "headBoat",
    "firstBoatNo",
    "firstBoat",
    "winnerBoatNo",
    "winnerBoat",
    "winner"
  ]) {
    const raw = row[field];
    const number = boatNumber(typeof raw === "object" ? objectBoatNumber(raw) : raw);
    if (number) heads.add(number);
  }

  for (const [field, value] of Object.entries(row)) {
    if (/ticket|combination|formation/i.test(field)) {
      const head = exactTicketHead(value);
      if (head) heads.add(head);
    }
  }

  const objectBoat = objectBoatNumber(row);
  const roles = roleText(row);
  const eligible = [
    ...arr(row.eligiblePositions),
    ...arr(row.positions),
    row.position,
    row.targetPosition
  ].map(Number).filter(Number.isFinite);
  const explicitHead = /(?:^|[\s_-])(?:head|alternate-head|first|winner)(?:$|[\s_-])|頭|1着/i.test(roles);
  if (objectBoat && (explicitHead || eligible.includes(1))) heads.add(objectBoat);
  return heads;
}

function numeric(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value.trim())) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  return null;
}

function priorityScore(row = {}) {
  const direct = numeric(row.priorityScore);
  if (direct !== null) return direct;

  const values = [];
  function walk(node, depth = 0) {
    if (!node || typeof node !== "object" || Array.isArray(node) || depth > 3) return;
    for (const [field, value] of Object.entries(node)) {
      if (field === "priorityScore") {
        const number = numeric(value);
        if (number !== null) values.push(number);
      }
      if (
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        /score|priority|selection|metric|breakdown/i.test(field)
      ) {
        walk(value, depth + 1);
      }
    }
  }
  walk(row);
  return values.length ? Math.max(...values) : null;
}

function reasonStrings(row = {}) {
  const fields = [
    "status",
    "decision",
    "reason",
    "flowReason",
    "rejectionReason",
    "decisionReason",
    "exclusionReason",
    "skipReason",
    "qualificationReason",
    "comment",
    "note",
    "scoreReason",
    "priorityReason"
  ];
  return fields.flatMap((field) => {
    const value = row?.[field];
    if (Array.isArray(value)) return value.map(String);
    return value == null ? [] : [String(value)];
  }).map((value) => value.trim()).filter(Boolean);
}

function selectionState(row = {}) {
  const reasons = reasonStrings(row);
  const stateTexts = [
    row.status,
    row.decision,
    row.rejectionReason,
    row.exclusionReason,
    row.skipReason
  ].flatMap((value) => Array.isArray(value) ? value : value == null ? [] : [value])
    .map(String);
  const stateText = stateTexts.join(" ");
  const allText = `${stateText} ${reasons.join(" ")}`;
  const selected =
    row.selected === true ||
    row.adopted === true ||
    row.isSelected === true ||
    /(?:^|\s)(?:selected|adopted)(?:$|\s)|正式採用|採用済み/i.test(stateText);
  const rejected =
    row.selected === false ||
    row.adopted === false ||
    row.isSelected === false ||
    row.qualified === false ||
    /rejected|excluded|skipped|不採用|非採用|除外|見送り/i.test(stateText);
  const duplicate = /duplicate|重複|同一買い目|同一展開|既出|統合/i.test(allText);
  return { selected, rejected, duplicate, reasons };
}

function roleClass(row = {}) {
  const text = roleText(row);
  if (/(?:^|[\s_-])(?:main-head|primary-head)(?:$|[\s_-])|本線頭|主軸/i.test(text)) return "primary-head";
  if (/(?:^|[\s_-])(?:alternate-head|head)(?:$|[\s_-])|頭|1着/i.test(text)) return "head";
  if (/attack|攻め/i.test(text)) return "attack";
  if (/pickup|hold|support|second|third|拾い|残し|相手|2着|3着/i.test(text)) return "support";
  return "unclassified";
}

function rolePriority(value) {
  return {
    "primary-head": 4,
    head: 3,
    attack: 2,
    support: 1,
    unclassified: 0
  }[value] ?? 0;
}

function pathTokens(pathText) {
  return String(pathText || "")
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .map((value) => value.trim())
    .filter(Boolean);
}

function valueAtPath(root, pathText) {
  let current = root;
  for (const token of pathTokens(pathText)) {
    if (current == null) return undefined;
    current = current[token];
  }
  return current;
}

function pickEntry(rows, targetBoat, expectedScore) {
  const candidates = arr(rows)
    .map((row, index) => ({
      row,
      index,
      heads: [...headBoats(row)],
      score: priorityScore(row)
    }))
    .filter((entry) => entry.heads.includes(targetBoat));
  if (!candidates.length) return null;

  return candidates.sort((left, right) => {
    const leftExact = Number.isFinite(expectedScore) && left.score === expectedScore ? 1 : 0;
    const rightExact = Number.isFinite(expectedScore) && right.score === expectedScore ? 1 : 0;
    if (leftExact !== rightExact) return rightExact - leftExact;
    const leftScore = Number.isFinite(left.score) ? left.score : -Infinity;
    const rightScore = Number.isFinite(right.score) ? right.score : -Infinity;
    return rightScore - leftScore || left.index - right.index;
  })[0];
}

function inspectTarget(sourceRow = {}, predictionRecord = null) {
  const comparison = object(sourceRow.primaryComparison);
  const base = {
    date: sourceRow.date,
    jcd: String(sourceRow.jcd || "").padStart(2, "0"),
    raceNo: Number(sourceRow.raceNo || 0),
    actualHead: boatNumber(sourceRow.actualHead),
    finalHead: boatNumber(sourceRow.finalHead),
    comparisonPath: String(comparison.path || ""),
    upstreamWinnerScore: numeric(comparison.winnerScore),
    upstreamFinalScore: numeric(comparison.finalScore),
    upstreamGap: numeric(comparison.gap),
    upstreamWinnerAhead: comparison.winnerAhead === true,
    upstreamTied: comparison.tied === true,
    upstreamDuplicateReason: comparison.duplicateReason === true
  };

  if (!predictionRecord) {
    return {
      ...base,
      resolved: false,
      classification: "missing-prediction-record",
      signals: ["missing-prediction-record"]
    };
  }

  const rankingArray = valueAtPath(predictionRecord.prediction || {}, base.comparisonPath);
  if (!Array.isArray(rankingArray)) {
    return {
      ...base,
      resolved: false,
      classification: "missing-ranking-array",
      signals: ["missing-ranking-array"]
    };
  }

  const winner = pickEntry(rankingArray, base.actualHead, base.upstreamWinnerScore);
  const final = pickEntry(rankingArray, base.finalHead, base.upstreamFinalScore);
  if (!winner || !final) {
    return {
      ...base,
      resolved: false,
      rankingArrayLength: rankingArray.length,
      winnerRowFound: Boolean(winner),
      finalRowFound: Boolean(final),
      classification: "missing-comparison-row",
      signals: ["missing-comparison-row"]
    };
  }

  const winnerState = selectionState(winner.row);
  const finalState = selectionState(final.row);
  const winnerRole = roleClass(winner.row);
  const finalRole = roleClass(final.row);
  const resolvedWinnerScore = winner.score;
  const resolvedFinalScore = final.score;
  const gap = Number.isFinite(resolvedWinnerScore) && Number.isFinite(resolvedFinalScore)
    ? round1(resolvedFinalScore - resolvedWinnerScore)
    : base.upstreamGap;
  const tied = gap === 0;
  const winnerAhead = Number.isFinite(gap) && gap < 0;
  const duplicate =
    base.upstreamDuplicateReason ||
    winnerState.duplicate ||
    finalState.duplicate;
  const orderRelation = winner.index < final.index
    ? "winner-earlier"
    : winner.index > final.index
      ? "final-earlier"
      : "same-index";

  const signals = [];
  if (winnerAhead) signals.push("winner-score-ahead");
  if (tied) signals.push("priority-score-tied");
  if (winnerState.selected) signals.push("winner-explicit-selected");
  if (winnerState.rejected) signals.push("winner-explicit-rejected");
  if (finalState.selected) signals.push("final-explicit-selected");
  if (finalState.rejected) signals.push("final-explicit-rejected");
  if (duplicate) signals.push("duplicate-overlap");
  signals.push(orderRelation);
  if (rolePriority(winnerRole) < rolePriority(finalRole)) signals.push("winner-role-lower-priority");
  if (winnerRole === finalRole) signals.push("same-role-class");

  let classification;
  if (winnerAhead && winnerState.rejected) {
    classification = "winner-ahead-explicit-rejection";
  } else if (winnerAhead) {
    classification = "winner-ahead-selector-inversion";
  } else if (tied && winnerState.rejected && duplicate) {
    classification = "tie-duplicate-rejection";
  } else if (tied && winnerState.rejected) {
    classification = "tie-explicit-rejection";
  } else if (tied && orderRelation === "final-earlier") {
    classification = "tie-final-earlier-order";
  } else if (tied && orderRelation === "winner-earlier") {
    classification = "tie-winner-earlier-but-lost";
  } else if (tied) {
    classification = "tie-no-saved-tiebreak";
  } else {
    classification = "unresolved-selection-inconsistency";
  }

  return {
    ...base,
    resolved: true,
    rankingArrayLength: rankingArray.length,
    resolvedWinnerScore,
    resolvedFinalScore,
    resolvedGap: gap,
    winnerIndex: winner.index,
    finalIndex: final.index,
    orderRelation,
    winnerRole,
    finalRole,
    winnerSelectionState: {
      selected: winnerState.selected,
      rejected: winnerState.rejected,
      duplicate: winnerState.duplicate
    },
    finalSelectionState: {
      selected: finalState.selected,
      rejected: finalState.rejected,
      duplicate: finalState.duplicate
    },
    winnerReasons: winnerState.reasons.slice(0, 8),
    finalReasons: finalState.reasons.slice(0, 8),
    classification,
    signals: [...new Set(signals)]
  };
}

function increment(map, value) {
  const keyValue = String(value || "unknown");
  map.set(keyValue, (map.get(keyValue) || 0) + 1);
}

function sortedObject(map) {
  return Object.fromEntries(
    [...map.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
  );
}

function decideNextStep({ applicable, metrics }) {
  if (!applicable) {
    return {
      nextStep: "follow-priority-score-audit-next-step",
      reason: "上流の固定nextStepが選択整合性監査ではないため、この監査は適用しない。"
    };
  }
  if (metrics.targetCount < FIXED_RULES.minimumTargetCount) {
    return {
      nextStep: "continue-collecting-priority-selection-evidence",
      reason: `対象${metrics.targetCount}Rで、固定した最低${FIXED_RULES.minimumTargetCount}Rに未到達。`
    };
  }
  if (metrics.resolvedPairCoverageRate < FIXED_RULES.minimumResolvedPairCoverageRate) {
    return {
      nextStep: "improve-priority-selection-observability",
      reason: `比較行の解決率${metrics.resolvedPairCoverageRate}%で、固定した${FIXED_RULES.minimumResolvedPairCoverageRate}%未満。`
    };
  }
  if (metrics.strictInversionCount >= FIXED_RULES.strictInversionCountForShadowReplay) {
    return {
      nextStep: "build-local-water-priority-selector-shadow-replay",
      reason: `勝ち艇のpriorityScoreが上なのに未選択が${metrics.strictInversionCount}Rあり、固定条件${FIXED_RULES.strictInversionCountForShadowReplay}R以上を満たした。`
    };
  }
  if (metrics.duplicateSignalShare >= FIXED_RULES.duplicateShareForOrderAudit) {
    return {
      nextStep: "audit-local-water-priority-dedup-before-selection",
      reason: `重複・同一買い目信号が${metrics.duplicateSignalShare}%で、固定条件${FIXED_RULES.duplicateShareForOrderAudit}%以上。`
    };
  }
  if (
    metrics.tiedCount >= FIXED_RULES.minimumTieCount &&
    metrics.tieFinalEarlierShare >= FIXED_RULES.tieOrderShareForAudit
  ) {
    return {
      nextStep: "audit-local-water-priority-tiebreak-order",
      reason: `同点${metrics.tiedCount}Rのうち最終頭が配列前方の割合が${metrics.tieFinalEarlierShare}%で、固定条件を満たした。`
    };
  }
  if (metrics.explicitWinnerRejectionCount >= FIXED_RULES.explicitRejectionCountForContractAudit) {
    return {
      nextStep: "audit-local-water-priority-rejection-contract",
      reason: `勝ち艇候補の明示的除外が${metrics.explicitWinnerRejectionCount}Rで、固定条件${FIXED_RULES.explicitRejectionCountForContractAudit}R以上。`
    };
  }
  return {
    nextStep: "audit-local-water-priority-selector-structure",
    reason: "固定した主要分岐条件には未到達したため、選択器の構造監査へ進む。"
  };
}

function build(sourceReport = {}, predictionDocs = []) {
  const source = object(sourceReport);
  const applicable =
    source.version === EXPECTED_SOURCE_VERSION &&
    source.nextStep === EXPECTED_SOURCE_NEXT_STEP;
  const predictions = predictionRows(predictionDocs);
  const targets = arr(source.targetRaces).filter((row) => {
    const comparison = object(row.primaryComparison);
    return row.comparable === true &&
      comparison.winnerOutscored !== true &&
      (comparison.winnerAhead === true || comparison.tied === true || Number(comparison.gap) <= 0);
  });

  const cases = targets.map((row) => inspectTarget(row, predictions.get(key(row)) || null));
  const resolvedCases = cases.filter((row) => row.resolved);
  const classifications = new Map();
  const signals = new Map();
  const paths = new Map();
  for (const row of cases) {
    increment(classifications, row.classification);
    increment(paths, row.comparisonPath || "missing");
    for (const signal of arr(row.signals)) increment(signals, signal);
  }

  const tiedCases = resolvedCases.filter((row) => row.resolvedGap === 0);
  const metrics = {
    sourceComparableCount: Number(source.metrics?.scoreComparableCount || 0),
    targetCount: targets.length,
    predictionMatchedCount: cases.filter((row) => row.classification !== "missing-prediction-record").length,
    resolvedPairCount: resolvedCases.length,
    strictInversionCount: resolvedCases.filter((row) => Number(row.resolvedGap) < 0).length,
    tiedCount: tiedCases.length,
    explicitWinnerRejectionCount: resolvedCases.filter((row) => row.winnerSelectionState?.rejected).length,
    explicitWinnerSelectedCount: resolvedCases.filter((row) => row.winnerSelectionState?.selected).length,
    explicitFinalSelectedCount: resolvedCases.filter((row) => row.finalSelectionState?.selected).length,
    duplicateSignalCount: resolvedCases.filter((row) => row.signals.includes("duplicate-overlap")).length,
    tieFinalEarlierCount: tiedCases.filter((row) => row.orderRelation === "final-earlier").length,
    tieWinnerEarlierCount: tiedCases.filter((row) => row.orderRelation === "winner-earlier").length,
    tieSameIndexCount: tiedCases.filter((row) => row.orderRelation === "same-index").length,
    winnerRoleLowerPriorityCount: resolvedCases.filter((row) => row.signals.includes("winner-role-lower-priority")).length
  };
  metrics.resolvedPairCoverageRate = rate(metrics.resolvedPairCount, metrics.targetCount);
  metrics.strictInversionRate = rate(metrics.strictInversionCount, metrics.targetCount);
  metrics.tiedRate = rate(metrics.tiedCount, metrics.targetCount);
  metrics.duplicateSignalShare = rate(metrics.duplicateSignalCount, metrics.resolvedPairCount);
  metrics.tieFinalEarlierShare = rate(metrics.tieFinalEarlierCount, metrics.tiedCount);
  metrics.winnerRoleLowerPriorityShare = rate(metrics.winnerRoleLowerPriorityCount, metrics.resolvedPairCount);

  const decision = decideNextStep({ applicable, metrics });
  return {
    schemaVersion: 1,
    version: "local-water-priority-selection-consistency-audit-v1",
    generatedAt: new Date().toISOString(),
    productionChanged: false,
    automaticApplication: false,
    usableForPrediction: false,
    methodology: "当地・水面の同一確定コホートで、実5・6号艇勝ちが同じ保存済み候補配列内で最終頭以上のpriorityScoreを持ちながら未選択だった例だけを対象に、締切前保存済みの選択フラグ・除外理由・配列順・役割・重複信号を監査する。",
    sourceVersion: source.version || null,
    sourceGeneratedAt: source.generatedAt || null,
    sourceNextStep: source.nextStep || null,
    applicable,
    fixedDecisionRules: FIXED_RULES,
    metrics,
    classifications: sortedObject(classifications),
    signalCounts: sortedObject(signals),
    comparisonPathCounts: sortedObject(paths),
    nextStep: decision.nextStep,
    decisionReason: decision.reason,
    cases
  };
}

function main() {
  const report = build(
    loadJson(INPUT, {}),
    loadDaily(path.join(ROOT, "data", "predictions"))
  );
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    applicable: report.applicable,
    metrics: report.metrics,
    classifications: report.classifications,
    nextStep: report.nextStep,
    decisionReason: report.decisionReason
  }, null, 2));
}

if (require.main === module) main();
module.exports = {
  exactTicketHead,
  headBoats,
  priorityScore,
  selectionState,
  roleClass,
  valueAtPath,
  inspectTarget,
  decideNextStep,
  build
};
