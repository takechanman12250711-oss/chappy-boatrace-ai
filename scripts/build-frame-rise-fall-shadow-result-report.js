"use strict";

const fs = require("node:fs");
const path = require("node:path");
const engine = require("../js/frame-rise-fall-shadow-result-report");
const futility = require("../js/frame-rise-fall-shadow-futility");

const root = path.resolve(__dirname, "..");
const predictionDir = path.join(root, "data", "predictions");
const resultDir = path.join(root, "data", "results");
const output = path.join(root, "data", "stats", "frame-rise-fall-shadow-result-report.json");

function loadDocuments(directory, compact = value => value) {
  if (!fs.existsSync(directory)) return [];
  const documents = [];
  for (const name of fs.readdirSync(directory).filter(name => /^\d{8}\.json$/.test(name)).sort()) {
    documents.push(compact(JSON.parse(fs.readFileSync(path.join(directory, name), "utf8"))));
  }
  return documents;
}

function compactSide(side = {}) {
  return {
    skipDecision: side?.skipDecision,
    practicalTickets: side?.practicalTickets
  };
}

function compactPredictionRecord(record = {}) {
  const snapshot = record?.frameRiseFallShadowAb || null;
  const replay = snapshot?.downstreamReplay || null;
  return {
    raceKey: record?.raceKey,
    date: record?.date,
    jcd: record?.jcd,
    raceNo: record?.raceNo,
    place: record?.place,
    selectedAt: record?.selectedAt,
    frameRiseFallShadowAb: snapshot ? {
      candidateId: snapshot?.candidateId,
      candidateSpecFingerprint: snapshot?.candidateSpecFingerprint,
      implementationFingerprint: snapshot?.implementationFingerprint,
      cutoff: snapshot?.cutoff ? {
        selectedAtExclusiveLowerBound: snapshot.cutoff.selectedAtExclusiveLowerBound,
        sourceCommit: snapshot.cutoff.sourceCommit,
        logicFingerprint: snapshot.cutoff.logicFingerprint
      } : undefined,
      comparisonContract: snapshot?.comparisonContract ? {
        comparableForFixed100: snapshot.comparisonContract.comparableForFixed100,
        ticketContractViolations: snapshot.comparisonContract.ticketContractViolations
      } : undefined,
      downstreamReplay: replay ? {
        status: replay.status,
        a: compactSide(replay.a),
        b: compactSide(replay.b)
      } : undefined
    } : undefined
  };
}

function compactPredictionDoc(doc = {}) {
  return {
    verificationPredictions: (Array.isArray(doc?.verificationPredictions) ? doc.verificationPredictions : [])
      .map(compactPredictionRecord)
  };
}

function compactResultRecord(record = {}) {
  return {
    date: record?.date,
    jcd: record?.jcd,
    raceNo: record?.raceNo,
    resultAvailable: record?.resultAvailable,
    status: record?.status,
    trifecta: record?.trifecta ? {
      combination: record.trifecta.combination,
      payout: record.trifecta.payout
    } : undefined
  };
}

function compactResultDoc(doc = {}) {
  return {
    races: (Array.isArray(doc?.races) ? doc.races : []).map(compactResultRecord)
  };
}

function buildReport(predictionDocuments, resultDocuments) {
  return futility.evaluate(
    engine.build(predictionDocuments, resultDocuments)
  );
}

function main() {
  const report = buildReport(
    loadDocuments(predictionDir, compactPredictionDoc),
    loadDocuments(resultDir, compactResultDoc)
  );
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(
    `枠別浮沈Shadow結果: 比較候補${report.observation.eligibleComparableCount}R` +
    `／公式結果照合${report.observation.settledComparableCount}/100R` +
    `／status=${report.status}`
  );
}

if (require.main === module) main();
module.exports = {
  loadDocuments,
  compactSide,
  compactPredictionRecord,
  compactPredictionDoc,
  compactResultRecord,
  compactResultDoc,
  buildReport,
  main
};
