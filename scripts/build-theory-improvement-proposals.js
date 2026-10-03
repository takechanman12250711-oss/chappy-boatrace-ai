"use strict";
const fs = require("node:fs");
const path = require("node:path");
const proposals = require("../js/theory-improvement-proposals");
const approvalGate = require("../js/theory-improvement-approval-gate");
const theoryPerformance = require("./build-theory-performance-report");

const root = path.resolve(__dirname, "..");
const input = path.join(root, "data", "stats", "theory-performance-report.json");
const predictionDir = path.join(root, "data", "predictions");
const output = path.join(root, "data", "stats", "theory-improvement-proposals.json");

function load(filePath, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

/*
  The approval gate only reads the stored theory evaluations, settled result,
  and the prediction fields used by theory-performance replay. Daily documents
  also contain large runtime/browser snapshots. Project each parsed row before
  retaining it so the gate keeps the same saved evidence without holding those
  unused payloads for the full history.
*/
function compactApprovalRecord(record = {}) {
  return {
    ...theoryPerformance.compactPredictionRecord(record),
    theoryEvaluationSnapshot:
      record.theoryEvaluationSnapshot,
    result: record.result
  };
}

function collectRecords(options = {}) {
  const directory =
    options.predictionDir || predictionDir;
  if (!fs.existsSync(directory)) return [];
  const rows = [];
  fs.readdirSync(directory)
    .filter(name => /^\d{8}\.json$/.test(name))
    .sort()
    .forEach(name => {
      const data = load(path.join(directory, name), {});
      rows.push(
        ...(Array.isArray(data.predictions)
          ? data.predictions.map(compactApprovalRecord)
          : []),
        ...(Array.isArray(data.verificationPredictions)
          ? data.verificationPredictions.map(compactApprovalRecord)
          : [])
      );
    });
  return rows;
}

function main() {
  const performance = load(input, {});
  const records = collectRecords();
  const report = {
    generatedAt: new Date().toISOString(),
    source: "data/stats/theory-performance-report.json",
    ...proposals.build(performance),
    approvalGate: approvalGate.build(records)
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(
    `理論改善提案：${report.proposalCount}件／` +
    `承認候補${report.approvalGate.approvedCandidateCount}件`
  );
}

if (require.main === module) main();
module.exports = {
  load,
  compactApprovalRecord,
  collectRecords
};
