"use strict";

const fs = require("node:fs");
const path = require("node:path");
const engine = require("../js/theory-adoption-phase5");

const root = path.resolve(__dirname, "..");
const statsDir = path.join(root, "data", "stats");
const performancePath = path.join(statsDir, "theory-performance-report.json");
const improvementPath = path.join(statsDir, "improvement-proposal-phase3.json");
const outputPath = path.join(statsDir, "theory-adoption-phase5.json");

function load(file, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) { if (error?.code === "ENOENT") return fallback; throw error; }
}

function main() {
  const report = engine.build(load(performancePath), load(improvementPath));
  fs.mkdirSync(statsDir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({ generatedAt: new Date().toISOString(), ...report }, null, 2) + "\n");
  console.log(`理論採用判定 Phase5：${report.theoryCount}理論／候補${report.summary.candidate}／保留${report.summary.hold}／却下候補${report.summary.reject}`);
}

if (require.main === module) main();
module.exports = { load };
