"use strict";

const fs = require("node:fs");
const path = require("node:path");
const engine = require("../js/frame-rise-fall-shadow-result-report");
const futility = require("../js/frame-rise-fall-shadow-futility");
const sourceReport = require("./build-frame-rise-fall-shadow-result-report");
const trial = require("../config/frame-rise-fall-negative-clip-trial.json");

const root = path.resolve(__dirname, "..");
const predictionDir = path.join(root, "data", "predictions");
const resultDir = path.join(root, "data", "results");
const output = path.join(root, "data", "stats", "frame-rise-fall-negative-clip-result-report.json");

function loadDocuments(directory, compact = value => value) {
  if (!fs.existsSync(directory)) return [];
  const documents = [];
  for (const name of fs.readdirSync(directory).filter(name => /^\d{8}\.json$/.test(name)).sort()) {
    documents.push(compact(JSON.parse(fs.readFileSync(path.join(directory, name), "utf8"))));
  }
  return documents;
}

function compactNegativePredictionRecord(record = {}) {
  const snapshot = record?.frameRiseFallNegativeClipShadowAb;
  const compacted = sourceReport.compactPredictionRecord({
    ...record,
    frameRiseFallShadowAb: snapshot
  });
  const {
    frameRiseFallShadowAb,
    ...identity
  } = compacted;
  return {
    ...identity,
    frameRiseFallNegativeClipShadowAb: frameRiseFallShadowAb
  };
}

function compactNegativePredictionDoc(document = {}) {
  return {
    verificationPredictions: (
      Array.isArray(document?.verificationPredictions)
        ? document.verificationPredictions
        : []
    )
      .filter(
        record =>
          record?.frameRiseFallNegativeClipShadowAb?.candidateId ===
          trial.candidateId
      )
      .map(compactNegativePredictionRecord)
  };
}

function remapPredictionDocuments(documents = []) {
  return documents.map(document => ({
    verificationPredictions: (Array.isArray(document?.verificationPredictions) ? document.verificationPredictions : [])
      .filter(record => record?.frameRiseFallNegativeClipShadowAb?.candidateId === trial.candidateId)
      .map(record => ({
        ...record,
        frameRiseFallShadowAb: record.frameRiseFallNegativeClipShadowAb
      }))
  }));
}

function buildReport(predictionDocuments = [], resultDocuments = []) {
  const report = futility.evaluate(
    engine.build(remapPredictionDocuments(predictionDocuments), resultDocuments)
  );
  return {
    ...report,
    version: "frame-rise-fall-negative-clip-result-report-v1",
    candidateId: trial.candidateId,
    trialCutoff: trial.cutoff,
    fixedComparableRaces: Number(trial.fixedComparableRaces || 100),
    productionAUnchanged: true,
    automaticApplication: false,
    usableForPrediction: false
  };
}

function main() {
  const report = buildReport(
    loadDocuments(predictionDir, compactNegativePredictionDoc),
    loadDocuments(resultDir, sourceReport.compactResultDoc)
  );
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(
    `negative clip shadow結果: 比較候補${report.observation.eligibleComparableCount}R` +
    `／公式結果照合${report.observation.settledComparableCount}/${report.protocol.fixedComparableRaces}R` +
    `／status=${report.status}`
  );
}

if (require.main === module) main();
module.exports = {
  loadDocuments,
  compactNegativePredictionRecord,
  compactNegativePredictionDoc,
  remapPredictionDocuments,
  buildReport,
  main
};
