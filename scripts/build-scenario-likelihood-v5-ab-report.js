"use strict";

const fs = require("node:fs");
const path = require("node:path");
const verification = require("../js/scenario-likelihood-v5-ab-verification");

const root = path.resolve(__dirname, "..");
const predictionDir = path.join(root, "data", "predictions");
const outputPath = path.join(
  root,
  "data",
  "stats",
  "scenario-likelihood-v5-ab-report.json"
);

function loadJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

function rowFromRecord(record) {
  const snapshot = record?.scenarioLikelihoodV5Ab;
  const officialResult = record?.result;
  const row = snapshot && officialResult
    ? verification.verify(snapshot, officialResult)
    : null;
  if (!row || row.comparable !== true) return null;
  return {
    ...row,
    raceKey: String(record?.raceKey || ""),
    date: String(record?.date || ""),
    jcd: String(record?.jcd || "").padStart(2, "0"),
    place: String(record?.place || ""),
    raceNo: Number(record?.raceNo || 0)
  };
}

function collectRows() {
  if (!fs.existsSync(predictionDir)) return [];
  const rowsByRaceKey = new Map();
  fs.readdirSync(predictionDir)
    .filter(name => /^\d{8}\.json$/.test(name))
    .sort()
    .forEach(name => {
      const data = loadJson(path.join(predictionDir, name), {});
      const records = [
        ...(Array.isArray(data.predictions) ? data.predictions : []),
        ...(Array.isArray(data.verificationPredictions)
          ? data.verificationPredictions
          : [])
      ];
      records.forEach(record => {
        const row = rowFromRecord(record);
        if (row?.raceKey) {
          rowsByRaceKey.set(row.raceKey, row);
        }
      });
    });
  return [...rowsByRaceKey.values()];
}

function main() {
  const rows = collectRows();
  const summary = verification.buildSummary(rows);
  const productionCandidates = [
    ...(summary.overall?.productionCandidate
      ? [{ scope: "overall", key: "overall", ...summary.overall }]
      : []),
    ...(summary.byVenue || [])
      .filter(item => item.productionCandidate)
      .map(item => ({ scope: "venue", ...item })),
    ...(summary.byActualScenario || [])
      .filter(item => item.productionCandidate)
      .map(item => ({ scope: "actual-scenario", ...item }))
  ];

  const report = {
    generatedAt: new Date().toISOString(),
    source: "data/predictions/*.json",
    status: productionCandidates.length
      ? "production-candidates-ready"
      : "collecting-data",
    ...summary,
    productionCandidateCount: productionCandidates.length,
    productionCandidates,
    usableForPrediction: false,
    automaticApplication: false
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(
    `展開AI v5 A/Bレポート：比較${report.overall?.samples || 0}R／` +
    `変化${report.overall?.changedSamples || 0}R／` +
    `本番候補${productionCandidates.length}件`
  );
}

if (require.main === module) main();

module.exports = { rowFromRecord, collectRows };
