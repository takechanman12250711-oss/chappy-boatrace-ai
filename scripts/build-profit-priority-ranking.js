"use strict";

const fs = require("node:fs");
const path = require("node:path");
const engine = require("../js/profit-priority-ranking");

const root = path.resolve(__dirname, "..");
const statsDir = path.join(root, "data", "stats");
const inputPath = path.join(statsDir, "theory-performance-report.json");
const outputPath = path.join(statsDir, "profit-priority-ranking.json");

function load(file, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) { if (error?.code === "ENOENT") return fallback; throw error; }
}

function main() {
  const report = engine.build(load(inputPath));
  fs.mkdirSync(statsDir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({ generatedAt: new Date().toISOString(), ...report }, null, 2) + "\n");
  const selected = report.selectedTheory?.label || "なし";
  console.log(`利益基準ランキング：${report.ranking.length}理論／改善候補 ${selected}`);
}

if (require.main === module) main();
module.exports = { load };
