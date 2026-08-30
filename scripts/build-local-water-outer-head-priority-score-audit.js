"use strict";

const fs = require("node:fs");
const path = require("node:path");
const rankingAudit = require("./build-local-water-outer-head-candidate-ranking-audit");

const root = path.resolve(__dirname, "..");
const OUT = path.join(
  root,
  "data",
  "stats",
  "local-water-outer-head-priority-score-audit.json"
);

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

function average(values) {
  const numbers = values.filter(Number.isFinite);
  return numbers.length
    ? round1(numbers.reduce((sum, value) => sum + value, 0) / numbers.length)
    : null;
}

function median(values) {
  const numbers = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!numbers.length) return null;
  const middle = Math.floor(numbers.length / 2);
  return numbers.length % 2
    ? round1(numbers[middle])
    : round1((numbers[middle - 1] + numbers[middle]) / 2);
}

function numeric(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value.trim())) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  return null;
}

function rowPriorityScore(row = {}) {
  const direct = numeric(row.priorityScore);
  if (direct !== null) return direct;
  const map = rankingAudit.collectMetricMap(row, ["priorityScore"]);
  const values = [...map.values()].filter(Number.isFinite);
  return values.length ? Math.max(...values) : null;
}

function reasonStrings(node = {}) {
  if (!node || typeof node !== "object" || Array.isArray(node)) return [];
  const fields = [
    "status",
    "decision",
    "reason",
    "flowReason",
    "rejectionReason",
    "decisionReason",
    "exclusionReason",
    "qualificationReason",
    "comment",
    "note",
    "scoreReason",
    "priorityReason"
  ];
  return fields.flatMap((field) => {
    const value = node[field];
    if (Array.isArray(value)) return value.map(String);
    return value == null ? [] : [String(value)];
  }).map((text) => text.trim()).filter(Boolean);
}

function normalizeComponentLabel(value) {
  return String(value || "")
    .replace(/^(?:正式採用|正式反映|暫定|参考|不成立)[・:：\s-]*/g, "")
    .replace(/[・:：\s-]+$/g, "")
    .trim();
}

function parseReasonComponents(text) {
  const components = new Map();
  for (const segment of String(text || "").split(/\s+\/\s+/)) {
    const match = segment.trim().match(/^(.*?)(-?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
    if (!match) continue;
    const label = normalizeComponentLabel(match[1]);
    const score = Number(match[2]);
    const maximum = Number(match[3]);
    if (!label || !Number.isFinite(score) || !Number.isFinite(maximum)) continue;
    components.set(label, { score, maximum });
  }
  return components;
}

function rowComponents(row = {}) {
  const components = new Map();
  for (const text of reasonStrings(row)) {
    for (const [label, value] of parseReasonComponents(text)) {
      const current = components.get(label);
      if (!current || value.score > current.score) components.set(label, value);
    }
  }

  for (const field of ["scoreBreakdown", "priorityComponents", "components"]) {
    const value = row?.[field];
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    for (const [label, raw] of Object.entries(value)) {
      const score = numeric(raw?.score ?? raw?.value ?? raw);
      const maximum = numeric(raw?.maximum ?? raw?.max ?? raw?.denominator);
      if (score === null) continue;
      components.set(normalizeComponentLabel(label), {
        score,
        maximum: maximum === null ? null : maximum
      });
    }
  }
  return components;
}

function isPriorityArrayPath(pathText) {
  return /candidateDecisions|headCandidates|evaluatedScenarioCandidates|scenarioCandidates|branches/i.test(String(pathText || ""));
}

function pathPriority(pathText) {
  const value = String(pathText || "");
  if (/targetDecisions\[\d+\]\.candidateDecisions$/i.test(value)) return 0;
  if (/raceScenarios\.mainScenario\.branches$/i.test(value)) return 1;
  if (/raceScenarios.*\.branches$/i.test(value)) return 2;
  return 3;
}

function compareArray(items, pathText, actual, final) {
  const rows = arr(items).filter((item) => item && typeof item === "object" && !Array.isArray(item));
  const winnerRows = rows.filter((row) => [...rankingAudit.headBoatsFromObject(row)].includes(actual));
  const finalRows = rows.filter((row) => [...rankingAudit.headBoatsFromObject(row)].includes(final));
  if (!winnerRows.length || !finalRows.length) return null;

  const winnerScored = winnerRows
    .map((row) => ({ row, score: rowPriorityScore(row) }))
    .filter((item) => Number.isFinite(item.score))
    .sort((a, b) => b.score - a.score);
  const finalScored = finalRows
    .map((row) => ({ row, score: rowPriorityScore(row) }))
    .filter((item) => Number.isFinite(item.score))
    .sort((a, b) => b.score - a.score);
  if (!winnerScored.length || !finalScored.length) return null;

  const winner = winnerScored[0];
  const selected = finalScored[0];
  const gap = round1(selected.score - winner.score);
  const winnerComponents = rowComponents(winner.row);
  const finalComponents = rowComponents(selected.row);
  const componentDiffs = [];
  for (const [label, winnerValue] of winnerComponents) {
    const finalValue = finalComponents.get(label);
    if (!finalValue) continue;
    componentDiffs.push({
      label,
      winnerScore: winnerValue.score,
      finalScore: finalValue.score,
      gap: round1(finalValue.score - winnerValue.score),
      maximum: winnerValue.maximum ?? finalValue.maximum ?? null
    });
  }

  const winnerReasons = reasonStrings(winner.row);
  const finalReasons = reasonStrings(selected.row);
  const duplicateReason = [...winnerReasons, ...finalReasons]
    .some((text) => rankingAudit.classifyReason(text) === "duplicate-overlap");

  return {
    path: pathText,
    pathPriority: pathPriority(pathText),
    winnerScore: winner.score,
    finalScore: selected.score,
    gap,
    winnerAhead: gap < 0,
    tied: gap === 0,
    winnerOutscored: gap > 0,
    duplicateReason,
    winnerReasons: winnerReasons.slice(0, 6),
    finalReasons: finalReasons.slice(0, 6),
    componentDiffs: componentDiffs.slice(0, 20)
  };
}

function inspectPriority(record, result) {
  const base = rankingAudit.inspectRace(record, result);
  const actual = rankingAudit.actualHead(result);
  const final = rankingAudit.finalHead(record);
  const comparisons = [];

  function walk(node, pathText = "") {
    if (node == null) return;
    if (Array.isArray(node)) {
      if (isPriorityArrayPath(pathText)) {
        const comparison = compareArray(node, pathText, actual, final);
        if (comparison) comparisons.push(comparison);
      }
      node.forEach((item, index) => walk(item, `${pathText}[${index}]`));
      return;
    }
    if (typeof node !== "object") return;
    for (const [field, value] of Object.entries(node)) {
      walk(value, pathText ? `${pathText}.${field}` : field);
    }
  }

  walk(record.prediction || {});

  comparisons.sort((a, b) =>
    a.pathPriority - b.pathPriority ||
    b.winnerScore - a.winnerScore ||
    a.gap - b.gap ||
    a.path.localeCompare(b.path)
  );
  const primary = comparisons[0] || null;

  return {
    date: record.date,
    jcd: String(record.jcd || "").padStart(2, "0"),
    raceNo: Number(record.raceNo || 0),
    actualHead: actual,
    finalHead: final,
    scenario: base.scenario,
    selected: base.selected,
    finalCorrect: base.finalCorrect,
    comparable: Boolean(primary),
    primaryComparison: primary,
    allComparisons: comparisons.slice(0, 10)
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

function dominantComponent(rows) {
  const stats = new Map();
  let totalPositiveGap = 0;
  for (const row of rows) {
    for (const component of arr(row.primaryComparison?.componentDiffs)) {
      if (!(component.gap > 0)) continue;
      totalPositiveGap += component.gap;
      const current = stats.get(component.label) || {
        label: component.label,
        count: 0,
        totalPositiveGap: 0,
        gaps: []
      };
      current.count++;
      current.totalPositiveGap += component.gap;
      current.gaps.push(component.gap);
      stats.set(component.label, current);
    }
  }
  const ranked = [...stats.values()].map((item) => ({
    label: item.label,
    count: item.count,
    totalPositiveGap: round1(item.totalPositiveGap),
    averageGap: average(item.gaps),
    shareOfPositiveComponentGap: totalPositiveGap
      ? round1(item.totalPositiveGap / totalPositiveGap * 100)
      : null
  })).sort((a, b) =>
    b.totalPositiveGap - a.totalPositiveGap ||
    b.count - a.count ||
    a.label.localeCompare(b.label)
  );
  return { dominant: ranked[0] || null, ranked };
}

function chooseNextStep(metrics, component) {
  if (metrics.scoreComparableCount < 20) return "continue-collecting-priority-score-evidence";
  if (metrics.winnerAheadOrTiedCount >= 5) {
    return "audit-local-water-priority-selection-consistency";
  }
  if (metrics.nearTieWithin5Count >= 10 && metrics.medianPositiveGap <= 5) {
    return "design-local-water-outer-head-tiebreak-shadow-ab";
  }
  if (
    component &&
    component.count >= 15 &&
    component.shareOfPositiveComponentGap >= 50
  ) {
    return "audit-local-water-dominant-priority-component";
  }
  if (metrics.duplicateReasonShare >= 50) {
    return "audit-local-water-priority-dedup-order";
  }
  if (metrics.medianPositiveGap >= 15) {
    return "audit-local-water-priority-score-construction";
  }
  return "audit-local-water-outer-head-priority-normalization";
}

function build(predDocs, resultDocs) {
  const results = resultMap(resultDocs);
  const targetRows = predictionRows(predDocs)
    .map((record) => ({
      record,
      evidence: rankingAudit.localWaterEvidence(record),
      result: results.get(key(record)) || null
    }))
    .filter((row) =>
      row.evidence.formal &&
      row.result &&
      [5, 6].includes(rankingAudit.actualHead(row.result))
    )
    .map((row) => inspectPriority(row.record, row.result))
    .filter((row) => row.scenario && !row.selected);

  const comparableRows = targetRows.filter((row) => row.comparable);
  const positiveGaps = comparableRows
    .map((row) => row.primaryComparison.gap)
    .filter((gap) => gap > 0);
  const componentStats = dominantComponent(comparableRows);

  const metrics = {
    unselectedScenarioHeadCount: targetRows.length,
    scoreComparableCount: comparableRows.length,
    winnerOutscoredCount: comparableRows.filter((row) => row.primaryComparison.winnerOutscored).length,
    winnerAheadCount: comparableRows.filter((row) => row.primaryComparison.winnerAhead).length,
    tiedCount: comparableRows.filter((row) => row.primaryComparison.tied).length,
    winnerAheadOrTiedCount: comparableRows.filter((row) => !row.primaryComparison.winnerOutscored).length,
    nearTieWithin5Count: comparableRows.filter((row) => row.primaryComparison.gap > 0 && row.primaryComparison.gap <= 5).length,
    gap5To10Count: comparableRows.filter((row) => row.primaryComparison.gap > 5 && row.primaryComparison.gap <= 10).length,
    gap10To20Count: comparableRows.filter((row) => row.primaryComparison.gap > 10 && row.primaryComparison.gap <= 20).length,
    gapOver20Count: comparableRows.filter((row) => row.primaryComparison.gap > 20).length,
    duplicateReasonCount: comparableRows.filter((row) => row.primaryComparison.duplicateReason).length,
    averagePositiveGap: average(positiveGaps),
    medianPositiveGap: median(positiveGaps)
  };
  metrics.comparableCoverageRate = rate(metrics.scoreComparableCount, metrics.unselectedScenarioHeadCount);
  metrics.winnerOutscoredRate = rate(metrics.winnerOutscoredCount, metrics.scoreComparableCount);
  metrics.winnerAheadOrTiedRate = rate(metrics.winnerAheadOrTiedCount, metrics.scoreComparableCount);
  metrics.nearTieWithin5Rate = rate(metrics.nearTieWithin5Count, metrics.scoreComparableCount);
  metrics.duplicateReasonShare = rate(metrics.duplicateReasonCount, metrics.scoreComparableCount);

  return {
    schemaVersion: 1,
    version: "local-water-outer-head-priority-score-audit-v1",
    generatedAt: new Date().toISOString(),
    productionChanged: false,
    automaticApplication: false,
    usableForPrediction: false,
    methodology: "Within the same settled formal local-water cohort, actual 5-6 winners that reached a head scenario but were not selected are compared with the final predicted head inside the same saved ranking array. The highest priorityScore per head is used; no post-result feature is created.",
    fixedDecisionRules: {
      minimumComparableCount: 20,
      selectionConsistencyWinnerAheadOrTiedMinimum: 5,
      nearTieCountMinimum: 10,
      nearTieMedianGapMaximum: 5,
      dominantComponentMinimumCount: 15,
      dominantComponentMinimumGapShare: 50,
      duplicateReasonShareThreshold: 50,
      largeMedianGapThreshold: 15
    },
    metrics,
    gapBands: {
      winnerAhead: metrics.winnerAheadCount,
      tied: metrics.tiedCount,
      within5: metrics.nearTieWithin5Count,
      from5To10: metrics.gap5To10Count,
      from10To20: metrics.gap10To20Count,
      over20: metrics.gapOver20Count
    },
    dominantComponent: componentStats.dominant,
    componentRanking: componentStats.ranked.slice(0, 20),
    nextStep: chooseNextStep(metrics, componentStats.dominant),
    topComparisonPaths: topCounts(
      comparableRows,
      (row) => [row.primaryComparison.path]
    ),
    topWinnerReasons: topCounts(
      comparableRows,
      (row) => row.primaryComparison.winnerReasons,
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
    dominantComponent: report.dominantComponent,
    nextStep: report.nextStep
  }, null, 2));
}

if (require.main === module) main();
module.exports = {
  rowPriorityScore,
  parseReasonComponents,
  rowComponents,
  compareArray,
  inspectPriority,
  dominantComponent,
  chooseNextStep,
  build
};
