"use strict";

const fs = require("node:fs");
const path = require("node:path");
const engine = require("../js/theory-ab-phase10");

const root = path.resolve(__dirname, "..");
const stats = path.join(root, "data", "stats");
const source = path.join(stats, "theory-improvement-proposal-phase9.json");
const candidateSource = path.join(stats, "theory-candidate-branch-analysis-phase9.json");
const output = path.join(stats, "theory-ab-phase10.json");

function load(file, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) { if (error?.code === "ENOENT") return fallback; throw error; }
}

function main() {
  const phase9 = load(source, {});
  const candidateAnalysis = load(candidateSource, {});
  const report = {
    generatedAt: new Date().toISOString(),
    source: "theory-improvement-proposal-phase9.json + theory-candidate-branch-analysis-phase9.json",
    ...engine.build(phase9, candidateAnalysis)
  };
  fs.mkdirSync(stats, { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
  console.log(`Phase10 A/B基盤：${report.status}`);
}

if (require.main === module) main();
module.exports = { load, main };
