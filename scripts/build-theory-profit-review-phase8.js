"use strict";

const fs = require("node:fs");
const path = require("node:path");
const phase8 = require("../js/theory-profit-review-phase8");

const root = path.resolve(__dirname, "..");
const stats = path.join(root, "data", "stats");

function load(file, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) { if (error?.code === "ENOENT") return fallback; throw error; }
}

function main() {
  const performance = load(path.join(stats, "theory-performance-report.json"), {});
  const ranking = load(path.join(stats, "profit-priority-ranking.json"), {});
  const report = {
    generatedAt: new Date().toISOString(),
    source: ["theory-performance-report.json", "profit-priority-ranking.json"],
    ...phase8.build(performance, ranking)
  };
  fs.mkdirSync(stats, { recursive: true });
  fs.writeFileSync(path.join(stats, "theory-profit-review-phase8.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(`Phase8利益レビュー：準備済み${report.readyTheoryCount}理論／候補 ${report.candidate?.label || "なし"}`);
}

if (require.main === module) main();
module.exports = { load, main };
