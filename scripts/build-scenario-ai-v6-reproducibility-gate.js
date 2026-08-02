"use strict";

const fs = require("node:fs");
const path = require("node:path");
const learning = require("./build-scenario-ai-v6-learning-report");

const ROOT = path.resolve(__dirname, "..");
const PREDICTIONS_DIR = path.join(ROOT, "data", "predictions");
const OUTPUT_PATH = path.join(ROOT, "data", "stats", "scenario-ai-v6-reproducibility-gate.json");

function readJson(filePath, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
  catch (error) { if (error?.code === "ENOENT") return fallback; throw error; }
}

function predictionFiles(directory = PREDICTIONS_DIR) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory).filter(name => /^\d{8}\.json$/.test(name)).sort().map(name => path.join(directory, name));
}

function splitRows(rows = []) {
  const sorted = [...rows].sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.raceKey).localeCompare(String(b.raceKey)) || Number(a.rank) - Number(b.rank));
  const midpoint = Math.ceil(sorted.length / 2);
  return { firstHalf: sorted.slice(0, midpoint), secondHalf: sorted.slice(midpoint) };
}

function actionFor(row, minimumSample) {
  return row ? learning.proposalFor(row, minimumSample).action : "collect";
}

function evaluate(scope, fullRow, firstRow, secondRow, minimumHalfSample) {
  const reasons = [];
  const firstAction = actionFor(firstRow, minimumHalfSample);
  const secondAction = actionFor(secondRow, minimumHalfSample);
  const exactGap = Math.abs(Number(firstRow?.exactRate || 0) - Number(secondRow?.exactRate || 0));
  const firstGap = Math.abs(Number(firstRow?.firstHitRate || 0) - Number(secondRow?.firstHitRate || 0));
  const methodGap = Math.abs(Number(firstRow?.winningMethodMatchRate || 0) - Number(secondRow?.winningMethodMatchRate || 0));
  if (Number(firstRow?.sampleCount || 0) < minimumHalfSample || Number(secondRow?.sampleCount || 0) < minimumHalfSample) reasons.push("前半または後半のサンプル不足");
  if (!["raise", "lower"].includes(firstAction) || !["raise", "lower"].includes(secondAction)) reasons.push("前半または後半が強化・見直し方向ではない");
  if (firstAction !== secondAction) reasons.push("前半と後半で方向不一致");
  if (exactGap > 12) reasons.push("完全一致率差が12ポイント超");
  if (firstGap > 15) reasons.push("1着一致率差が15ポイント超");
  if (methodGap > 15) reasons.push("決まり手一致率差が15ポイント超");
  const approved = reasons.length === 0;
  return {
    scope,
    key: fullRow.key,
    label: fullRow.label,
    full: fullRow,
    firstHalf: firstRow || null,
    secondHalf: secondRow || null,
    firstAction,
    secondAction,
    differences: { exactRate: exactGap, firstHitRate: firstGap, winningMethodMatchRate: methodGap },
    approved,
    status: approved ? "approved-candidate" : "collecting-evidence",
    action: approved ? firstAction : "collect",
    adjustment: approved ? (firstAction === "raise" ? 2 : -2) : 0,
    reasons
  };
}

function buildReport(documents = []) {
  const rows = documents.flatMap(learning.scenarioRows);
  const halves = splitRows(rows);
  const aggregateType = source => learning.aggregate(source, row => row.scenarioType);
  const aggregateVenue = source => learning.aggregate(source, row => `${row.jcd}:${row.scenarioType}`, row => `${row.place || row.jcd} × ${row.scenarioType}`);
  const fullType = aggregateType(rows), fullVenue = aggregateVenue(rows);
  const mapByKey = list => new Map(list.map(row => [row.key, row]));
  const firstType = mapByKey(aggregateType(halves.firstHalf));
  const secondType = mapByKey(aggregateType(halves.secondHalf));
  const firstVenue = mapByKey(aggregateVenue(halves.firstHalf));
  const secondVenue = mapByKey(aggregateVenue(halves.secondHalf));
  const evaluations = [
    ...fullType.map(row => evaluate("scenario-type", row, firstType.get(row.key), secondType.get(row.key), 25)),
    ...fullVenue.map(row => evaluate("venue-scenario-type", row, firstVenue.get(row.key), secondVenue.get(row.key), 15))
  ];
  const approvedCandidates = evaluations.filter(row => row.approved);
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: "scenario-ai-v6-learning-report",
    splitPolicy: "time-ordered-half-split",
    thresholds: {
      scenarioTypeMinimumPerHalf: 25,
      venueScenarioTypeMinimumPerHalf: 15,
      maximumExactRateGap: 12,
      maximumFirstHitRateGap: 15,
      maximumWinningMethodMatchRateGap: 15,
      maximumAdjustment: 2
    },
    evaluatedScenarioCount: rows.length,
    firstHalfScenarioCount: halves.firstHalf.length,
    secondHalfScenarioCount: halves.secondHalf.length,
    evaluations,
    approvalGate: { approvedCandidateCount: approvedCandidates.length, approvedCandidates },
    applicationMode: "shadow-only",
    usableForPrediction: false,
    automaticApplication: false
  };
}

function main() {
  const report = buildReport(predictionFiles().map(file => readJson(file)));
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(`展開AI v6再現性：承認候補${report.approvalGate.approvedCandidateCount}件`);
}

if (require.main === module) main();
module.exports = { buildReport, splitRows, evaluate };
