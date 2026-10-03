"use strict";

const fs = require("node:fs");
const path = require("node:path");
const engine = require("../js/improvement-proposal-engine");
const missCauseAnalysis = require("../js/miss-cause-analysis");
const resultReview = require("./build-result-review");
const theoryPerformance = require("./build-theory-performance-report");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "data", "stats", "improvement-proposal-phase3.json");

function compactPredictionRecord(record = {}) {
  const prediction = record?.prediction || {};
  const raceFlow = prediction?.raceFlow || {};
  const practicalSelection =
    prediction?.practicalSelection?.verificationEvidence
      ? {
          verificationEvidence:
            prediction.practicalSelection.verificationEvidence
        }
      : undefined;
  const aiCore = prediction?.aiCore?.stSlitTheory
    ? {
        stSlitTheory:
          prediction.aiCore.stSlitTheory
      }
    : undefined;

  return {
    raceKey: record.raceKey,
    date: record.date,
    raceDate: record.raceDate,
    targetDate: record.targetDate,
    jcd: record.jcd,
    placeCode: record.placeCode,
    raceNo: record.raceNo,
    rno: record.rno,
    race: record.race,
    place: record.place,
    marker: record.marker,
    selectedAt: record.selectedAt,
    capturedAt: record.capturedAt,
    createdAt: record.createdAt,
    deadlineAt: record.deadlineAt,
    deadline: record.deadline,
    verificationMode: record.verificationMode,
    predictionMode: record.predictionMode,
    isRetrospective: record.isRetrospective,
    officialResultUsedForPrediction:
      record.officialResultUsedForPrediction,
    officialResultUsedForEvaluation:
      record.officialResultUsedForEvaluation,
    preRaceConditions: record.preRaceConditions,
    theoryTagSnapshot: record.theoryTagSnapshot,
    prediction: {
      practicalTickets:
        prediction.practicalTickets,
      verificationEvidence:
        prediction.verificationEvidence,
      practicalSelection,
      mainSheet:
        prediction.mainSheet,
      preRaceConditions:
        prediction.preRaceConditions,
      predictedScenarioTitle:
        prediction.predictedScenarioTitle,
      raceFlow: {
        title: raceFlow.title,
        scenario: raceFlow?.scenario
          ? {
              title:
                raceFlow.scenario.title
            }
          : undefined
      },
      internalEvaluation:
        prediction.internalEvaluation,
      aiCore,
      predictionMode:
        prediction.predictionMode,
      isRetrospective:
        prediction.isRetrospective,
      officialResultUsedForPrediction:
        prediction.officialResultUsedForPrediction,
      officialResultUsedForEvaluation:
        prediction.officialResultUsedForEvaluation
    }
  };
}

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
  const collected = theoryPerformance.collect({
    ...options,
    compactPredictionRecord
  });
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
  compactPredictionRecord,
  normalizeAnalysisRecord,
  collectAnalysis,
  collect
};
