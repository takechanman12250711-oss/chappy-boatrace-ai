"use strict";

const fs = require("node:fs");
const path = require("node:path");
const gate = require("../js/theory-shadow-production-gate");

const root = path.resolve(__dirname, "..");
const predictionDir = path.join(root, "data", "predictions");
const output = path.join(root, "data", "stats", "theory-shadow-production-gate.json");

function load(filePath, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
  catch (error) { if (error?.code === "ENOENT") return fallback; throw error; }
}

function collectRecords() {
  if (!fs.existsSync(predictionDir)) return [];
  const map = new Map();
  fs.readdirSync(predictionDir).filter(name => /^\d{8}\.json$/.test(name)).sort().forEach(name => {
    const data = load(path.join(predictionDir, name), {});
    [...(Array.isArray(data.predictions) ? data.predictions : []), ...(Array.isArray(data.verificationPredictions) ? data.verificationPredictions : [])]
      .forEach(record => { if (record?.raceKey) map.set(record.raceKey, record); });
  });
  return [...map.values()];
}

function main() {
  const report = {
    generatedAt: new Date().toISOString(),
    source: "data/predictions/*.json",
    ...gate.build(collectRecords())
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(`理論補正本番候補：${report.status}／${report.overall.comparableCount}R`);
}

if (require.main === module) main();
module.exports = { collectRecords };
