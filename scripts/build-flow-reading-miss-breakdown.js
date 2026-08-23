"use strict";

const fs = require("node:fs");
const path = require("node:path");
const proposal = require("./build-improvement-proposal-report");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "data", "stats", "flow-reading-miss-breakdown.json");

function scenarioLabel(record = {}) {
  const prediction = record.prediction || {};
  const evidence = prediction.verificationEvidence || prediction?.practicalSelection?.verificationEvidence || {};
  return String(
    evidence?.mainScenario?.label ||
    prediction?.predictedScenarioTitle ||
    prediction?.raceFlow?.title ||
    prediction?.raceFlow?.scenario?.title ||
    "unknown"
  ).trim() || "unknown";
}

function scenarioVerification(record = {}) {
  return record?.result?.verification?.scenarioVerification ||
    record?.result?.scenarioVerification || {};
}

function bucketOf(record = {}) {
  const verification = scenarioVerification(record);
  const label = scenarioLabel(record);
  const expectedWinner = Number(verification.expectedWinner || 0) || null;
  const actualWinner = Number(verification.actualWinner || 0) || null;
  const expectedMethods = Array.isArray(verification.expectedMethods)
    ? verification.expectedMethods.map(String).filter(Boolean)
    : [];
  const winningMethod = String(verification.winningMethod || record?.result?.winningMethod || "").trim();
  const positionMatched = verification.positionMatched;
  const methodMatched = verification.methodMatched;
  let mismatchType = "legacy-or-theory-miss";
  if (verification.status === "missed") {
    if (positionMatched === false && methodMatched === false) mismatchType = "winner-and-method-miss";
    else if (positionMatched === false) mismatchType = "winner-miss";
    else if (methodMatched === false) mismatchType = "method-miss";
    else mismatchType = "structured-miss";
  }
  return {
    label,
    mismatchType,
    expectedWinner,
    actualWinner,
    expectedMethods: expectedMethods.join("/"),
    winningMethod
  };
}

function increment(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function sorted(map) {
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key, "ja"));
}

function build(records) {
  const flowMisses = records.filter(record =>
    (record?.result?.missCauseAnalysis?.candidates || [])
      .some(row => row?.code === "flow-reading-miss")
  );
  const byLabel = new Map();
  const byMismatchType = new Map();
  const byWinnerPair = new Map();
  const byMethodPair = new Map();
  const byCombined = new Map();

  flowMisses.forEach(record => {
    const bucket = bucketOf(record);
    increment(byLabel, bucket.label);
    increment(byMismatchType, bucket.mismatchType);
    if (bucket.expectedWinner && bucket.actualWinner) {
      increment(byWinnerPair, `${bucket.expectedWinner}->${bucket.actualWinner}`);
    }
    if (bucket.expectedMethods || bucket.winningMethod) {
      increment(byMethodPair, `${bucket.expectedMethods || "?"}->${bucket.winningMethod || "?"}`);
    }
    increment(byCombined, `${bucket.label}|${bucket.mismatchType}|${bucket.expectedWinner || "?"}->${bucket.actualWinner || "?"}|${bucket.expectedMethods || "?"}->${bucket.winningMethod || "?"}`);
  });

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    productionChanged: false,
    automaticApplication: false,
    usableForPrediction: false,
    sourceContract: proposal.ANALYSIS_INPUT_CONTRACT,
    flowReadingMissCount: flowMisses.length,
    byScenarioLabel: sorted(byLabel),
    byMismatchType: sorted(byMismatchType),
    byWinnerPair: sorted(byWinnerPair),
    byMethodPair: sorted(byMethodPair),
    topCombinedPatterns: sorted(byCombined).slice(0, 50),
    policy: "分析専用。結果後の内訳把握にのみ使用し、予想・買い目へ自動反映しない。"
  };
}

function main() {
  const records = proposal.collect();
  const report = build(records);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
  console.log(`展開読み違い内訳: ${report.flowReadingMissCount}R`);
}

if (require.main === module) main();
module.exports = { scenarioLabel, scenarioVerification, bucketOf, build };
