"use strict";

const fs = require("node:fs");
const path = require("node:path");
const gate = require("../js/learning-pipeline-gate");
const audit = require("../js/phase6-data-audit");
const improvementInput = require("./build-improvement-proposal-report");

const root = path.resolve(__dirname, "..");
const proposalPath = path.join(root, "data", "stats", "improvement-proposal-phase3.json");
const outputPath = path.join(root, "data", "stats", "learning-pipeline-gate-phase4.json");

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) { if (error?.code === "ENOENT") return fallback; throw error; }
}

function mergePredictionSources(data) {
  const predictions = Array.isArray(data?.predictions) ? data.predictions : [];
  const verification = Array.isArray(data?.verificationPredictions) ? data.verificationPredictions : [];
  const primaryKeys = new Set(predictions.map(audit.recordKey).filter(Boolean));
  return [
    ...predictions,
    ...verification.filter(row => {
      const key = audit.recordKey(row);
      return !key || !primaryKeys.has(key);
    })
  ];
}

function collectAnalysis(options = {}) {
  return improvementInput.collectAnalysis(options);
}

function collectRecords(options = {}) {
  return collectAnalysis(options).records;
}

function main() {
  const collected = collectAnalysis();
  const report = {
    generatedAt: new Date().toISOString(),
    source: "data/predictions/YYYYMMDD.json + data/results/YYYYMMDD.json + improvement-proposal-phase3.json",
    analysisInputContract:
      improvementInput.ANALYSIS_INPUT_CONTRACT,
    deduplication: "predictions-preferred-over-verificationPredictions",
    analysisInputDiagnostics: collected.diagnostics,
    ...gate.build(collected.records, readJson(proposalPath, {}))
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n");
  console.log(`学習パイプラインゲート：${report.status}／${report.settledRaceCount}R`);
  if (report.status.startsWith("blocked-")) process.exitCode = 1;
}

if (require.main === module) main();
module.exports = {
  mergePredictionSources,
  collectAnalysis,
  collectRecords
};
