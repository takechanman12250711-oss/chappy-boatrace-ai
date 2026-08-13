"use strict";

const fs = require("node:fs");
const path = require("node:path");
const report = require("../js/theory-performance-report");
const evaluator = require("../js/theory-evaluation-engine");
const verification = require("../js/prediction-verification");
const inputContract = require("./analysis-input-contract");
const zeroDiagnostics = require("./theory-zero-evidence-diagnostics");

const root = path.resolve(__dirname, "..");
const out = path.join(root, "data", "stats", "theory-performance-report.json");
const ANALYSIS_INPUT_CONTRACT =
  "official-pre-deadline-cohort-v1";

function officialPayout(result = {}) {
  const value = Number(
    result?.trifecta?.payout ??
    result?.payout ??
    result?.payoutPer100 ??
    result?.officialPayoutPer100
  );
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function normalizeCohortRecord(record = {}) {
  const officialResult = record?.__officialResult || {};
  const prediction = record?.prediction || {};
  const resultTicket = inputContract.actualTicket(officialResult);
  if (!resultTicket) return null;

  const verified = verification.verifyPrediction(
    prediction,
    officialResult
  );
  const normalized = {
    ...record,
    result: {
      schemaVersion: 5,
      settled: true,
      resultAvailable: true,
      resultTicket,
      winningMethod: String(
        officialResult?.winningMethod || ""
      ),
      payout: officialPayout(officialResult),
      payoutPer100: officialPayout(officialResult),
      practicalHit: verified.practicalHit === true,
      verification: {
        ...verified
      },
      officialSource: String(
        officialResult?.source || ""
      )
    }
  };
  normalized.theoryEvaluationSnapshot =
    evaluator.build(normalized);
  return normalized;
}

function collect(options = {}) {
  const cohort = inputContract.buildDefaultCohort({
    root: options.root || root,
    predictionsDir: options.predictionsDir,
    resultsDir: options.resultsDir
  });
  return {
    records: cohort.records
      .map(normalizeCohortRecord)
      .filter(Boolean),
    diagnostics: cohort.diagnostics
  };
}

function main() {
  const collected = collect();
  const records = collected.records;
  const built = {
    generatedAt: new Date().toISOString(),
    source: "data/predictions/YYYYMMDD.json + data/results/YYYYMMDD.json",
    analysisInputContract:
      ANALYSIS_INPUT_CONTRACT,
    deduplication:
      "predictions-preferred-over-verificationPredictions",
    analysisInputDiagnostics:
      collected.diagnostics,
    ...report.build(records),
    zeroEvidenceDiagnostics: zeroDiagnostics.build(records)
  };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(built, null, 2) + "\n");
  console.log(`理論別成績：${built.byTheory.length}理論／${built.sampleCount}評価行`);
  console.log("0件理論診断詳細:");
  console.log(JSON.stringify(built.zeroEvidenceDiagnostics, null, 2));
}

if (require.main === module) main();
module.exports = {
  ANALYSIS_INPUT_CONTRACT,
  officialPayout,
  normalizeCohortRecord,
  collect
};
