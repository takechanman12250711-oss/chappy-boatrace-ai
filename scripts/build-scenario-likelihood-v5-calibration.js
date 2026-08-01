"use strict";

const fs = require("node:fs");
const path = require("node:path");
const calibration = require("../js/scenario-likelihood-v5-calibration");

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

function rowsFromRecord(record) {
  const verification = record?.result?.scenarioLikelihoodV5Verification;
  if (!verification || verification.comparable !== true) return null;
  return {
    comparable: true,
    jcd: String(record?.jcd || "").padStart(2, "0"),
    raceKey: String(record?.raceKey || ""),
    actualScenario: String(verification.actualScenario || ""),
    leaderScenario: String(verification.leaderScenario || ""),
    runnerUpScenario: String(verification.runnerUpScenario || ""),
    ambiguity: String(verification.ambiguity || "unknown"),
    leaderLikelihood: Number(verification.leaderLikelihood || 0),
    leaderHit: verification.leaderHit === true,
    topTwoHit: verification.topTwoHit === true
  };
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
  const report = {
    generatedAt: new Date().toISOString(),
    source: "data/predictions/*.json",
    ...calibration.build(rows, { minimumSamples: 30 })
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(`展開AI v5校正集計：比較可能${report.comparableCount}R`);
}

if (require.main === module) main();

module.exports = { rowsFromRecord, collectRows };
