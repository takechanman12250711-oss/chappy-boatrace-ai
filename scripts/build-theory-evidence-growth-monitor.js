"use strict";

const fs = require("node:fs");
const path = require("node:path");
const monitor = require("../js/theory-evidence-growth-monitor");

const root = path.resolve(__dirname, "..");
const statsDir = path.join(root, "data", "stats");
const currentFile = path.join(statsDir, "theory-evidence-coverage-phase7.json");
const outFile = path.join(statsDir, "theory-evidence-growth-monitor.json");

function load(file, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) { if (error?.code === "ENOENT") return fallback; throw error; }
}

function main() {
  const current = load(currentFile, {});
  const previous = load(outFile, {});
  const report = {
    generatedAt: new Date().toISOString(),
    source: "theory-evidence-coverage-phase7.json",
    ...monitor.build(current, previous)
  };
  fs.mkdirSync(statsDir, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2) + "\n");
  console.log(`理論証拠成長監視：新規${report.newRaceCount}R／警告${report.warningCount}理論`);
}

if (require.main === module) main();
module.exports = { load, main };
