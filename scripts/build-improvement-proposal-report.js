"use strict";

const fs = require("node:fs");
const path = require("node:path");
const engine = require("../js/improvement-proposal-engine");

const root = path.resolve(__dirname, "..");
const dir = path.join(root, "data", "predictions");
const output = path.join(root, "data", "stats", "improvement-proposal-phase3.json");

function load(file, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) { if (error?.code === "ENOENT") return fallback; throw error; }
}

function collect() {
  if (!fs.existsSync(dir)) return [];
  const records = [];
  fs.readdirSync(dir).filter(name => /^\d{8}\.json$/.test(name)).sort().forEach(name => {
    const data = load(path.join(dir, name), {});
    records.push(...(Array.isArray(data.predictions) ? data.predictions : []));
    records.push(...(Array.isArray(data.verificationPredictions) ? data.verificationPredictions : []));
  });
  const unique = new Map();
  records.forEach(record => {
    const key = String(record?.raceKey || `${record?.date || ""}-${record?.jcd || ""}-${record?.raceNo || ""}`);
    if (key) unique.set(key, record);
  });
  return [...unique.values()];
}

function main() {
  const report = { generatedAt: new Date().toISOString(), source: "data/predictions/*.json", ...engine.build(collect()) };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
  console.log(`改善提案Phase3：${report.settledRaceCount}R／${report.proposalCount}候補`);
}

if (require.main === module) main();
module.exports = { collect };
