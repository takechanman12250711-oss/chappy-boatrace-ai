"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const OUT = path.join(
  root,
  "data",
  "stats",
  "local-water-outer-head-candidate-ranking-audit.json"
);

const SCORE_FIELDS = [
  "selectionScore",
  "priorityScore",
  "scenarioScore",
  "candidateScore",
  "purchaseScore",
  "effectiveScore",
  "evaluationScore",
  "totalScore",
  "score",
  "confidence",
  "likelihood",
  "probability"
];
const RANK_FIELDS = [
  "selectionRank",
  "priorityRank",
  "scenarioRank",
  "candidateRank",
  "rank",
  "order"
];
const REASON_FIELDS = [
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
  "note"
];

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function key(row = {}) {
  return `${row.date}-${String(row.jcd || "").padStart(2, "0")}-${Number(row.raceNo || 0)}`;
}

function load(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => /^\d{8}\.json$/.test(name))
    .sort()
    .map((name) => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")));
}

function predictionRows(docs) {
  const map = new Map();
  for (const doc of docs) {
    for (const name of ["predictions", "verificationPredictions"]) {
      for (const row of arr(doc?.[name])) {
        const rowKey = key(row);
        if (name === "predictions" || !map.has(rowKey)) map.set(rowKey, row);
      }
    }
  }
  return [...map.values()];
}

function resultMap(docs) {
  const map = new Map();
  for (const doc of docs) {
    for (const race of arr(doc?.races)) {
      if (race?.resultAvailable === true && race?.status === "finished") {
        map.set(key(race), race);
      }
    }
  }
  return map;
}

function round1(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function rate(count, total) {
  return total ? round1(count / total * 100) : null;
}

function boatNumber(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 6
    ? number
    : null;
}

function objectBoatNo(value = {}) {
  if (!value || typeof value !== "object") return null;
  for (const field of [
    "boatNo",
    "boat",
    "number",
    "waku",
    "teiban",
    "targetBoatNo",
    "candidateBoatNo"
  ]) {
    const number = boatNumber(value[field]);
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

function localWaterEvidence(record = {}) {
  const prediction = record.prediction || {};
  const support = prediction.venueWaterSupport ||
    prediction?.verificationEvidence?.localWater || {};
  const venue = String(support.venue || "").trim();
  const windRaw = Number(support.wind);
  const waveRaw = Number(support.wave);
  const wind = Number.isFinite(windRaw) ? windRaw : null;
  const wave = Number.isFinite(waveRaw) ? waveRaw : null;
  const tide = String(support.tide || "").trim();
  const statements = [
    ...arr(support.statements),
    ...arr(support.confirmations),
    ...arr(support.confirms),
    ...arr(support.cautions),
    ...arr(support.alerts)
  ].map(String);
  const formal = Boolean(venue) && statements.length > 0 && (
    wind !== null ||
    wave !== null ||
    Boolean(tide) ||
    statements.some((text) => /イン|差し|潮|風|波|水面|ナイター|展示|乗り心地/.test(text))
  );
  return { formal, venue, wind, wave, tide, statements };
}

function actualHead(result = {}) {
  const combination = String(
    result?.trifecta?.combination || result?.resultTicket || ""
  ).trim();
  return /^[1-6]-[1-6]-[1-6]$/.test(combination)
    ? Number(combination.split("-")[0])
    : null;
}

function finalHead(record = {}) {
  const prediction = record.prediction || {};
  return boatNumber(
    prediction?.verificationEvidence?.mainScenario?.headBoatNo ??
    prediction?.raceFlow?.scenario?.headBoatNo ??
    prediction?.aiCore?.raceScenarios?.mainScenario?.headBoatNo ??
    0
  );
}

function resolveStage(pathText, inheritedStage = null) {
  const value = String(pathText || "");
  if (
    /^verificationEvidence\.mainScenario(?:\.|$)/i.test(value) ||
    /^raceFlow\.scenario(?:\.|$)/i.test(value)
  ) {
    return "final";
  }
  if (
    /(?:^|\.)(?:practicalTickets|selectedCandidate|selectedCandidates|selectedTicket|selectedTickets|adoptedTicket|adoptedTickets|bestCandidateTicket|qualifiedCandidateTickets)(?:\.|\[|$)/i.test(value)
  ) {
    return "selected";
  }
  if (
    /(?:^|\.)(?:raceScenarios|mainScenario|alternateScenario|scenarioBranches|scenarioCandidates|scenarios|subScenario)(?:\.|\[|$)/i.test(value)
  ) {
    return "scenario";
  }
  if (
    /(?:candidate|targetDecisions|preservedEvaluationTargets|evaluatedScenarioCandidates|headCandidates|attackBoats)/i.test(value)
  ) {
    return "candidate";
  }
  return inheritedStage;
}

function roleText(node = {}) {
  return [
    node.role,
    node.roleIntent,
    node.type,
    ...(Array.isArray(node.roleIntents) ? node.roleIntents : []),
    ...(Array.isArray(node.roleLabels) ? node.roleLabels : [])
  ].filter(Boolean).map(String).join(" ");
}

function headBoatsFromObject(node = {}) {
  const heads = new Set();
  if (!node || typeof node !== "object" || Array.isArray(node)) return heads;

  for (const field of [
    "headBoatNo",
    "headBoat",
    "firstBoatNo",
    "firstBoat",
    "winnerBoatNo",
    "winnerBoat",
    "winner"
  ]) {
    const number = boatNumber(
      typeof node[field] === "object" ? objectBoatNo(node[field]) : node[field]
    );
    if (number) heads.add(number);
  }

  for (const [field, value] of Object.entries(node)) {
    if (/ticket|combination|formation/i.test(field)) {
      const head = exactTicketHead(value);
      if (head) heads.add(head);
    }
  }

  const objectBoat = objectBoatNo(node);
  const roles = roleText(node);
  const eligiblePositions = arr(node.eligiblePositions).map(Number);
  const explicitHeadRole = /(?:^|[\s_-])(?:head|alternate-head)(?:$|[\s_-])|頭|1着/i.test(roles);
  const eligibleForHead =
    eligiblePositions.includes(1) ||
    Number(node.position) === 1 ||
    Number(node.targetPosition) === 1;
  if (objectBoat && (explicitHeadRole || eligibleForHead)) heads.add(objectBoat);

  return heads;
}

function supportBoatsFromObject(node = {}) {
  const supports = new Set();
  if (!node || typeof node !== "object" || Array.isArray(node)) return supports;
  const objectBoat = objectBoatNo(node);
  const roles = roleText(node);
  const eligiblePositions = arr(node.eligiblePositions).map(Number);
  if (
    objectBoat &&
    (
      /hold|pickup|support|opponent|相手|残し|拾い|2着|3着/i.test(roles) ||
      (eligiblePositions.length > 0 && !eligiblePositions.includes(1))
    )
  ) {
    supports.add(objectBoat);
  }
  return supports;
}

function reasonText(node = {}) {
  if (!node || typeof node !== "object" || Array.isArray(node)) return "";
  return REASON_FIELDS
    .flatMap((field) => {
      const value = node[field];
      if (Array.isArray(value)) return value.map(String);
      return value == null ? [] : [String(value)];
    })
    .map((text) => text.trim())
    .filter(Boolean)
    .join("・")
    .slice(0, 500);
}

function classifyReason(text) {
  const value = String(text || "");
  if (/上限|点数(?:制限|枠|上限)|最大(?:7|10)点|採用枠|枠不足|上限超過|購入対象外|quota|cap|limit/i.test(value)) {
    return "quota-cap";
  }
  if (/重複|duplicate|同一買い目|同一展開|既出|統合/i.test(value)) {
    return "duplicate-overlap";
  }
  if (/スコア|score|順位|rank|優先|劣後|下位|比較|不足|基準未満|threshold|priority/i.test(value)) {
    return "score-rank";
  }
  if (/2着|3着|相手|残し|拾い|hold|pickup|support|third|second/i.test(value)) {
    return "support-role";
  }
  return value ? "other-structured" : null;
}

function numericValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value.trim())) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  return null;
}

function collectMetricMap(node, fields, depth = 0, prefix = "") {
  const map = new Map();
  if (!node || typeof node !== "object" || Array.isArray(node) || depth > 2) return map;

  for (const [field, value] of Object.entries(node)) {
    const pathName = prefix ? `${prefix}.${field}` : field;
    if (fields.includes(field)) {
      const number = numericValue(value);
      if (number !== null) map.set(pathName, number);
    }
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      /score|rank|metric|evaluation|priority|selection|breakdown/i.test(field)
    ) {
      for (const [nestedKey, nestedValue] of collectMetricMap(value, fields, depth + 1, pathName)) {
        map.set(nestedKey, nestedValue);
      }
    }
  }
  return map;
}

function rowHeadBoats(row) {
  return [...headBoatsFromObject(row)];
}

function commonMetricComparison(winnerRows, finalRows, fields, higherIsBetter, arrayPath) {
  const winnerMaps = winnerRows.map((row) => collectMetricMap(row, fields));
  const finalMaps = finalRows.map((row) => collectMetricMap(row, fields));
  const fieldOrder = fields.flatMap((field) => [field, `scores.${field}`, `scoreBreakdown.${field}`, `metrics.${field}`]);
  const allKeys = new Set();
  winnerMaps.forEach((map) => map.forEach((_, metric) => allKeys.add(metric)));
  finalMaps.forEach((map) => map.forEach((_, metric) => allKeys.add(metric)));
  const ordered = [
    ...fieldOrder.filter((field) => allKeys.has(field)),
    ...[...allKeys].filter((field) => !fieldOrder.includes(field)).sort()
  ];

  for (const metric of ordered) {
    const winnerValues = winnerMaps.map((map) => map.get(metric)).filter(Number.isFinite);
    const finalValues = finalMaps.map((map) => map.get(metric)).filter(Number.isFinite);
    if (!winnerValues.length || !finalValues.length) continue;
    const winnerValue = higherIsBetter
      ? Math.max(...winnerValues)
      : Math.min(...winnerValues);
    const finalValue = higherIsBetter
      ? Math.max(...finalValues)
      : Math.min(...finalValues);
    const winnerLost = higherIsBetter
      ? winnerValue < finalValue
      : winnerValue > finalValue;
    const tied = winnerValue === finalValue;
    return {
      path: arrayPath,
      metric,
      metricType: higherIsBetter ? "score" : "rank",
      winnerValue,
      finalValue,
      winnerLost,
      tied
    };
  }
  return null;
}

function isRankingArrayPath(pathText) {
  return /candidateDecisions|headCandidates|evaluatedScenarioCandidates|targetDecisions|scenarioCandidates|branches|practicalTickets|selectedCandidates/i.test(String(pathText || ""));
}

function analyzeRankingArray(items, pathText, actual, final) {
  const rows = arr(items).filter((item) => item && typeof item === "object" && !Array.isArray(item));
  if (!rows.length) return null;
  const winnerRows = rows.filter((row) => rowHeadBoats(row).includes(actual));
  const finalRows = final
    ? rows.filter((row) => rowHeadBoats(row).includes(final))
    : [];
  if (!winnerRows.length) return null;

  const scoreComparison = finalRows.length
    ? commonMetricComparison(winnerRows, finalRows, SCORE_FIELDS, true, pathText)
    : null;
  const rankComparison = !scoreComparison && finalRows.length
    ? commonMetricComparison(winnerRows, finalRows, RANK_FIELDS, false, pathText)
    : null;
  const reasons = winnerRows
    .map(reasonText)
    .filter(Boolean)
    .slice(0, 8);
  const selected = winnerRows.some((row) =>
    row.selected === true ||
    row.adopted === true ||
    row.isSelected === true ||
    /採用|selected|adopted/i.test(String(row.status || row.decision || ""))
  );
  const rejected = winnerRows.some((row) =>
    row.selected === false ||
    row.adopted === false ||
    row.isSelected === false ||
    row.qualified === false ||
    /不採用|除外|見送り|rejected|excluded|skipped/i.test(String(row.status || row.decision || ""))
  );

  return {
    path: pathText,
    winnerRowCount: winnerRows.length,
    finalRowCount: finalRows.length,
    comparison: scoreComparison || rankComparison,
    reasons,
    selected,
    rejected
  };
}

function inspectRace(record, result) {
  const prediction = record.prediction || {};
  const actual = actualHead(result);
  const final = finalHead(record);
  const stageHeads = {
    candidate: new Set(),
    scenario: new Set(),
    selected: new Set(),
    final: new Set()
  };
  const support = new Set();
  const winnerReasons = [];
  const rankingArrays = [];
  const evidencePaths = [];

  function addStageHeads(stage, heads, pathText, detail) {
    if (!stageHeads[stage]) return;
    for (const head of heads) {
      stageHeads[stage].add(head);
      if (head === actual && evidencePaths.length < 30) {
        evidencePaths.push({ stage, path: pathText, detail: String(detail || "").slice(0, 160) });
      }
    }
  }

  function walk(node, pathText = "", inheritedStage = null) {
    const stage = resolveStage(pathText, inheritedStage);
    if (node == null) return;
    if (Array.isArray(node)) {
      if (isRankingArrayPath(pathText)) {
        const audit = analyzeRankingArray(node, pathText, actual, final);
        if (audit) rankingArrays.push(audit);
      }
      node.forEach((item, index) => walk(item, `${pathText}[${index}]`, stage));
      return;
    }
    if (typeof node !== "object") return;

    const heads = headBoatsFromObject(node);
    if (stage) addStageHeads(stage, heads, pathText, roleText(node) || reasonText(node));
    const supports = supportBoatsFromObject(node);
    supports.forEach((boat) => support.add(boat));

    const objectBoat = objectBoatNo(node);
    if (heads.has(actual) || objectBoat === actual) {
      const text = reasonText(node);
      if (text && winnerReasons.length < 30) {
        winnerReasons.push({
          stage: stage || "unclassified",
          path: pathText,
          reason: text,
          category: classifyReason(text)
        });
      }
    }

    for (const [field, child] of Object.entries(node)) {
      const childPath = pathText ? `${pathText}.${field}` : field;
      const childStage = resolveStage(childPath, stage);
      if (childStage && /^(?:headBoatNo|headBoat|firstBoatNo|firstBoat|winnerBoatNo|winnerBoat|winner)$/i.test(field)) {
        const number = boatNumber(typeof child === "object" ? objectBoatNo(child) : child);
        if (number) addStageHeads(childStage, new Set([number]), childPath, field);
      }
      if (childStage && /ticket|combination|formation/i.test(field)) {
        const head = exactTicketHead(child);
        if (head) addStageHeads(childStage, new Set([head]), childPath, child);
      }
      if (/secondCandidates|thirdCandidates|hold|pickup|support|opponent/i.test(field)) {
        const direct = Array.isArray(child) ? child : [child];
        direct.forEach((value) => {
          const number = boatNumber(value) || objectBoatNo(value);
          if (number) support.add(number);
        });
      }
      walk(child, childPath, childStage);
    }
  }

  walk(prediction);

  const scenario = stageHeads.scenario.has(actual);
  const selected = stageHeads.selected.has(actual);
  const candidate = stageHeads.candidate.has(actual);
  const finalCorrect = final === actual;
  const finalAny56 = final === 5 || final === 6;
  const comparisons = rankingArrays
    .map((row) => row.comparison)
    .filter(Boolean);
  const winnerOutscored = comparisons.some((row) => row.winnerLost);
  const reasonCategories = new Set(
    winnerReasons.map((row) => row.category).filter(Boolean)
  );
  const rankingReasonTexts = [
    ...winnerReasons.map((row) => row.reason),
    ...rankingArrays.flatMap((row) => row.reasons)
  ].filter(Boolean);
  rankingReasonTexts.forEach((text) => {
    const category = classifyReason(text);
    if (category) reasonCategories.add(category);
  });
  const structuredRankingEvidence =
    comparisons.length > 0 ||
    rankingArrays.length > 0 ||
    winnerReasons.length > 0;

  let classification = "no-head-evidence";
  if (finalCorrect) classification = "final-correct";
  else if (selected) classification = "selected-head-lost-at-final-handoff";
  else if (scenario && reasonCategories.has("quota-cap")) classification = "quota-cap-rejection";
  else if (scenario && reasonCategories.has("duplicate-overlap")) classification = "duplicate-overlap-rejection";
  else if (scenario && (winnerOutscored || reasonCategories.has("score-rank"))) classification = "score-rank-loss";
  else if (scenario && structuredRankingEvidence) classification = "scenario-head-unselected-other-structured";
  else if (scenario) classification = "scenario-head-unselected-no-structured-reason";
  else if (candidate) classification = "candidate-head-not-promoted";
  else if (support.has(actual)) classification = "support-only-not-head-eligible";

  return {
    date: record.date,
    jcd: String(record.jcd || "").padStart(2, "0"),
    raceNo: Number(record.raceNo || 0),
    actualHead: actual,
    finalHead: final,
    candidate,
    scenario,
    selected,
    finalAny56,
    finalCorrect,
    supportOnly: support.has(actual) && !candidate && !scenario,
    structuredRankingEvidence,
    winnerOutscored,
    reasonCategories: [...reasonCategories].sort(),
    classification,
    comparisons: comparisons.slice(0, 8),
    rankingArrays: rankingArrays.slice(0, 12),
    winnerReasons: winnerReasons.slice(0, 12),
    evidencePaths: evidencePaths.slice(0, 16)
  };
}

function topCounts(rows, selector, limit = 20) {
  const counts = new Map();
  for (const row of rows) {
    for (const value of arr(selector(row))) {
      const text = String(value || "").trim();
      if (!text) continue;
      counts.set(text, (counts.get(text) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}

function chooseNextStep(metrics) {
  if (metrics.actualHead56Count < 20) return "continue-collecting-evidence";

  const unselectedDominates =
    metrics.unselectedScenarioHeadCount >= metrics.selectedThenFinalDroppedCount;

  if (unselectedDominates && metrics.unselectedScenarioHeadCount > 0) {
    if (metrics.structuredRankingCoverageRate < 60) {
      return "improve-local-water-outer-head-ranking-observability";
    }
    if (metrics.quotaCapShareOfUnselected >= 50) {
      return "audit-local-water-ticket-quota-allocation";
    }
    const comparableMinimum = Math.min(
      20,
      Math.max(5, Math.ceil(metrics.unselectedScenarioHeadCount * 0.5))
    );
    if (
      metrics.scoreComparableCount >= comparableMinimum &&
      metrics.winnerOutscoredRate >= 60
    ) {
      return "audit-local-water-outer-head-score-order";
    }
    if (metrics.scoreRankShareOfUnselected >= 50) {
      return "audit-local-water-outer-head-score-order";
    }
    if (metrics.duplicateShareOfUnselected >= 30) {
      return "audit-local-water-duplicate-allocation";
    }
    return "audit-local-water-outer-head-candidate-selection-structure";
  }

  if (metrics.selectedThenFinalDroppedCount >= 10) {
    return "audit-local-water-main-head-handoff";
  }

  return "continue-monitoring";
}

function build(predDocs, resultDocs) {
  const results = resultMap(resultDocs);
  const settledFormal = predictionRows(predDocs)
    .map((record) => ({
      record,
      evidence: localWaterEvidence(record),
      result: results.get(key(record)) || null
    }))
    .filter((row) => row.evidence.formal && row.result && actualHead(row.result));

  const targetRows = settledFormal
    .filter((row) => [5, 6].includes(actualHead(row.result)))
    .map((row) => inspectRace(row.record, row.result));

  const count = (predicate) => targetRows.filter(predicate).length;
  const unselectedScenarioRows = targetRows.filter((row) => row.scenario && !row.selected);
  const classifications = {};
  for (const row of targetRows) {
    classifications[row.classification] = (classifications[row.classification] || 0) + 1;
  }

  const metrics = {
    settledFormalEvidenceRaceCount: settledFormal.length,
    actualHead56Count: targetRows.length,
    actualHead5Count: count((row) => row.actualHead === 5),
    actualHead6Count: count((row) => row.actualHead === 6),
    scenarioHeadCount: count((row) => row.scenario),
    selectedHeadCount: count((row) => row.selected),
    unselectedScenarioHeadCount: unselectedScenarioRows.length,
    selectedThenFinalDroppedCount: count((row) => row.selected && !row.finalCorrect),
    finalAny56Count: count((row) => row.finalAny56),
    finalCorrectCount: count((row) => row.finalCorrect),
    structuredRankingEvidenceCount: unselectedScenarioRows.filter((row) => row.structuredRankingEvidence).length,
    scoreComparableCount: unselectedScenarioRows.filter((row) => row.comparisons.length > 0).length,
    winnerOutscoredCount: unselectedScenarioRows.filter((row) => row.winnerOutscored).length,
    quotaCapRejectionCount: unselectedScenarioRows.filter((row) => row.reasonCategories.includes("quota-cap")).length,
    scoreRankLossCount: unselectedScenarioRows.filter((row) =>
      row.winnerOutscored || row.reasonCategories.includes("score-rank")
    ).length,
    duplicateOverlapCount: unselectedScenarioRows.filter((row) => row.reasonCategories.includes("duplicate-overlap")).length,
    missingStructuredReasonCount: unselectedScenarioRows.filter((row) => !row.structuredRankingEvidence).length
  };

  metrics.scenarioHeadCoverageRate = rate(metrics.scenarioHeadCount, metrics.actualHead56Count);
  metrics.selectedHeadCoverageRate = rate(metrics.selectedHeadCount, metrics.actualHead56Count);
  metrics.structuredRankingCoverageRate = rate(
    metrics.structuredRankingEvidenceCount,
    metrics.unselectedScenarioHeadCount
  );
  metrics.winnerOutscoredRate = rate(
    metrics.winnerOutscoredCount,
    metrics.scoreComparableCount
  );
  metrics.quotaCapShareOfUnselected = rate(
    metrics.quotaCapRejectionCount,
    metrics.unselectedScenarioHeadCount
  );
  metrics.scoreRankShareOfUnselected = rate(
    metrics.scoreRankLossCount,
    metrics.unselectedScenarioHeadCount
  );
  metrics.duplicateShareOfUnselected = rate(
    metrics.duplicateOverlapCount,
    metrics.unselectedScenarioHeadCount
  );
  metrics.selectedThenFinalDroppedRate = rate(
    metrics.selectedThenFinalDroppedCount,
    metrics.actualHead56Count
  );
  metrics.finalCorrectRate = rate(metrics.finalCorrectCount, metrics.actualHead56Count);

  return {
    schemaVersion: 1,
    version: "local-water-outer-head-candidate-ranking-audit-v1",
    generatedAt: new Date().toISOString(),
    productionChanged: false,
    automaticApplication: false,
    usableForPrediction: false,
    methodology: "The same settled formal local-water cohort is audited without post-result feature creation. Actual 5-6 winners that reached a saved head scenario are traced through structured candidate-decision arrays, score/rank comparisons, explicit rejection reasons, selected head tickets, and final main-head handoff.",
    fixedDecisionRules: {
      minimumActualHead56Count: 20,
      minimumStructuredRankingCoverageRate: 60,
      quotaCapShareThreshold: 50,
      winnerOutscoredRateThreshold: 60,
      scoreRankShareThreshold: 50,
      duplicateShareThreshold: 30,
      selectedThenFinalDroppedMinimum: 10
    },
    metrics,
    classifications,
    nextStep: chooseNextStep(metrics),
    topReasonCategories: topCounts(
      unselectedScenarioRows,
      (row) => row.reasonCategories
    ),
    topReasonTexts: topCounts(
      unselectedScenarioRows,
      (row) => row.winnerReasons.map((reason) => reason.reason),
      20
    ),
    topComparisonFields: topCounts(
      unselectedScenarioRows,
      (row) => row.comparisons.map((comparison) => `${comparison.metricType}:${comparison.metric}`),
      20
    ),
    topRankingArrayPaths: topCounts(
      unselectedScenarioRows,
      (row) => row.rankingArrays.map((array) => array.path),
      20
    ),
    targetRaces: targetRows
  };
}

function main() {
  const report = build(
    load(path.join(root, "data", "predictions")),
    load(path.join(root, "data", "results"))
  );
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({
    metrics: report.metrics,
    classifications: report.classifications,
    nextStep: report.nextStep
  }, null, 2));
}

if (require.main === module) main();
module.exports = {
  exactTicketHead,
  localWaterEvidence,
  actualHead,
  finalHead,
  resolveStage,
  headBoatsFromObject,
  classifyReason,
  collectMetricMap,
  analyzeRankingArray,
  inspectRace,
  chooseNextStep,
  build
};
