"use strict";

const fs = require("node:fs");
const path = require("node:path");
const verification = require("../js/theory-shadow-ab-verification");

const root = path.resolve(__dirname, "..");
const predictionDir = path.join(root, "data", "predictions");
const output = path.join(root, "data", "stats", "theory-shadow-ab-report.json");

function load(filePath, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

function collectRecords() {
  if (!fs.existsSync(predictionDir)) return [];
  const map = new Map();
  fs.readdirSync(predictionDir)
    .filter(name => /^\d{8}\.json$/.test(name))
    .sort()
    .forEach(name => {
      const data = load(path.join(predictionDir, name), {});
      [...(Array.isArray(data.predictions) ? data.predictions : []), ...(Array.isArray(data.verificationPredictions) ? data.verificationPredictions : [])]
        .forEach(record => {
          if (record?.raceKey) map.set(record.raceKey, record);
        });
    });
  return [...map.values()];
}

function summarizeGroups(rows, keyFn) {
  const groups = new Map();
  rows.forEach(row => {
    const keys = keyFn(row);
    (Array.isArray(keys) ? keys : [keys]).filter(Boolean).forEach(key => {
      const list = groups.get(key) || [];
      list.push(row.verification);
      groups.set(key, list);
    });
  });
  return [...groups.entries()]
    .map(([key, list]) => ({ key, ...verification.summarize(list) }))
    .sort((a, b) => b.comparableCount - a.comparableCount || a.key.localeCompare(b.key));
}

function build(records) {
  const rows = (Array.isArray(records) ? records : [])
    .filter(record => record?.result?.settled === true && record?.theoryShadowAb)
    .map(record => {
      const result = verification.verify(record.theoryShadowAb, record?.result?.resultTicket);
      return {
        raceKey: String(record?.raceKey || ""),
        jcd: String(record?.jcd || "").padStart(2, "0"),
        place: String(record?.place || ""),
        verification: result,
        theoryKeys: [...new Set((result.appliedTheories || []).map(item => String(item?.theoryKey || "")).filter(Boolean))]
      };
    });

  return {
    version: "1.0.0",
    status: rows.some(row => row.verification.comparable) ? "collecting-comparisons" : "no-comparable-data",
    interpretation: "Bが公式的中目を押し上げたか・下げたかを評価。買い目自体は変更していないため的中率比較ではない。",
    overall: verification.summarize(rows.map(row => row.verification)),
    byTheory: summarizeGroups(rows, row => row.theoryKeys),
    byVenueTheory: summarizeGroups(rows, row => row.theoryKeys.map(key => `${row.jcd}:${key}`)),
    usableForPrediction: false,
    automaticApplication: false
  };
}

function main() {
  const report = {
    generatedAt: new Date().toISOString(),
    source: "data/predictions/*.json",
    ...build(collectRecords())
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(`理論補正A/B比較：${report.overall.comparableCount}R`);
}

if (require.main === module) main();
module.exports = { collectRecords, build };
