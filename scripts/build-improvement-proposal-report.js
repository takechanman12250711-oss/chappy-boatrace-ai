"use strict";

const fs = require("node:fs");
const path = require("node:path");
const engine = require("../js/improvement-proposal-engine");
const missCauseAnalysis = require("../js/miss-cause-analysis");
const resultReview = require("./build-result-review");
const theoryPerformance = require("./build-theory-performance-report");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "data", "stats", "improvement-proposal-phase3.json");

function normalizeAnalysisRecord(record) {
  const review = resultReview.buildReview(record);
  if (!review) return null;
  const normalized = {
    ...record,
    result: {
      ...record.result,
      review
    }
  };
  normalized.result.missCauseAnalysis =
    missCauseAnalysis.build(normalized);
  return normalized;
}

function collectAnalysis(options = {}) {
  const collected = theoryPerformance.collect(options);
  return {
    records: collected.records
      .map(normalizeAnalysisRecord)
      .filter(Boolean),
    diagnostics: collected.diagnostics
  };
}

function collect(options = {}) {
  return collectAnalysis(options).records;
}

function main() {
  const collected = collectAnalysis();
  const report = {
    generatedAt: new Date().toISOString(),
    source: "data/predictions/YYYYMMDD.json + data/results/YYYYMMDD.json",
    analysisInputContract:
      theoryPerformance.ANALYSIS_INPUT_CONTRACT,
    deduplication:
      "predictions-preferred-over-verificationPredictions",
    analysisInputDiagnostics: collected.diagnostics,
    ...engine.build(collected.records)
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
  console.log(`改善提案Phase3：${report.settledRaceCount}R／${report.proposalCount}候補`);
}

if (require.main === module) main();
module.exports = {
  ANALYSIS_INPUT_CONTRACT:
    theoryPerformance.ANALYSIS_INPUT_CONTRACT,
  normalizeAnalysisRecord,
  collectAnalysis,
  collect
};
