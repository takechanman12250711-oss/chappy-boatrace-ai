"use strict";

const fs = require("node:fs");
const path = require("node:path");
const calibration = require("../js/scenario-likelihood-v5-calibration");
const approvalGate = require("../js/scenario-likelihood-v5-approval-gate");

const root = path.resolve(__dirname, "..");
const predictionDir = path.join(root, "data", "predictions");
const outputPath = path.join(root, "data", "stats", "scenario-likelihood-v5-calibration.json");

function loadJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

function scenarioName(value) {
  if (value && typeof value === "object") {
    return String(value.label || value.key || "");
  }
  return String(value || "");
}

function directVerificationRow(record) {
  const verification = record?.result?.scenarioLikelihoodV5Verification;
  if (!verification || verification.comparable !== true) return null;
  const leader = verification.predictedLeader || null;
  const runnerUp = verification.predictedRunnerUp || null;
  return {
    comparable: true,
    jcd: String(record?.jcd || "").padStart(2, "0"),
    raceKey: String(record?.raceKey || ""),
    actualScenario: scenarioName(verification.actualScenario),
    leaderScenario: scenarioName(leader || verification.leaderScenario),
    runnerUpScenario: scenarioName(runnerUp || verification.runnerUpScenario),
    ambiguity: String(verification.ambiguity || "unknown"),
    leaderLikelihood: Number(
      leader?.relativeLikelihood ?? verification.leaderLikelihood ?? 0
    ),
    leaderHit: verification.leaderHit === true,
    topTwoHit:
      verification.top2Hit === true ||
      verification.topTwoHit === true
  };
}

function abVerificationRow(record) {
  const verification = record?.result?.scenarioLikelihoodV5AbVerification;
  const snapshot = record?.scenarioLikelihoodV5Ab?.a;
  if (!verification || verification.comparable !== true || !verification.a) {
    return null;
  }
  return {
    comparable: true,
    jcd: String(record?.jcd || "").padStart(2, "0"),
    raceKey: String(record?.raceKey || ""),
    actualScenario: scenarioName(verification.actualScenario),
    leaderScenario: scenarioName(
      snapshot?.leader || verification.a.leaderScenario
    ),
    runnerUpScenario: scenarioName(
      snapshot?.runnerUp || verification.a.runnerUpScenario
    ),
    ambiguity: String(
      snapshot?.ambiguity || verification.a.ambiguity || "unknown"
    ),
    leaderLikelihood: Number(
      snapshot?.leader?.relativeLikelihood ?? 0
    ),
    leaderHit: verification.a.leaderHit === true,
    topTwoHit: verification.a.topTwoHit === true
  };
}

function rowsFromRecord(record) {
  return directVerificationRow(record) || abVerificationRow(record);
}

function collectRows() {
  if (!fs.existsSync(predictionDir)) return [];
  const rows = [];
  fs.readdirSync(predictionDir)
    .filter(name => /^\d{8}\.json$/.test(name))
    .sort()
    .forEach(name => {
      const data = loadJson(path.join(predictionDir, name), {});
      const records = [
        ...(Array.isArray(data.predictions) ? data.predictions : []),
        ...(Array.isArray(data.verificationPredictions) ? data.verificationPredictions : [])
      ];
      records.forEach(record => {
        const row = rowsFromRecord(record);
        if (row) rows.push(row);
      });
    });
  return rows;
}

function main() {
  const rows = collectRows();
  const proposalReport = calibration.build(rows, { minimumSamples: 30 });
  const approvalReport = approvalGate.build(rows, {
    minimumVenueSamples: 100,
    minimumScenarioSamples: 50,
    minimumVenueScenarioSamples: 100,
    minimumAmbiguitySamples: 100,
    minimumHalfSamples: 25,
    minimumGap: 8,
    maximumHalfGapDifference: 8,
    maximumAdjustmentPoints: 5
  });
  const report = {
    generatedAt: new Date().toISOString(),
    source: "data/predictions/*.json",
    ...proposalReport,
    approvalGate: approvalReport
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(
    `展開AI v5校正集計：比較可能${report.comparableCount}R／` +
    `承認候補${approvalReport.approvedCandidateCount}件`
  );
}

if (require.main === module) main();

module.exports = {
  scenarioName,
  directVerificationRow,
  abVerificationRow,
  rowsFromRecord,
  collectRows
};
