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

// This gate reads only settled/resultTicket and B's saved adjustments. Project
// each day's records before retaining them across dates; full saved predictions
// include large unrelated snapshots. Preserve the existing overwrite order.
function compactRecord(record) {
  const shadow = record?.theoryShadowAb;
  const tickets = shadow?.b?.tickets;
  return {
    raceKey: record?.raceKey,
    jcd: record?.jcd,
    result: record?.result && {
      settled: record.result.settled,
      resultTicket: record.result.resultTicket
    },
    theoryShadowAb: shadow && { b: {
      tickets: Array.isArray(tickets) ? tickets.map(row => row && typeof row === 'object' ? {
        ticket: row.ticket,
        changed: row.changed,
        adjustmentPoints: row.adjustmentPoints
      } : row) : tickets
    } }
  };
}

function collectRecords(directory = predictionDir) {
  if (!fs.existsSync(directory)) return [];
  const map = new Map();
  fs.readdirSync(directory).filter(name => /^\d{8}\.json$/.test(name)).sort().forEach(name => {
    const data = load(path.join(directory, name), {});
    [...(Array.isArray(data.predictions) ? data.predictions : []), ...(Array.isArray(data.verificationPredictions) ? data.verificationPredictions : [])]
      .forEach(record => { if (record?.raceKey) map.set(record.raceKey, compactRecord(record)); });
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
module.exports = { collectRecords, compactRecord };
