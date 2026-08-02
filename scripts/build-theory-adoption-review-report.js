"use strict";

const fs = require("node:fs");
const path = require("node:path");
const review = require("../js/theory-adoption-review-report");

const root = path.resolve(__dirname, "..");
const gatePath = path.join(root, "data", "stats", "theory-shadow-production-gate.json");
const improvementPath = path.join(root, "data", "stats", "theory-improvement-proposals.json");
const output = path.join(root, "data", "stats", "theory-adoption-review-report.json");

function load(filePath, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

function main() {
  const report = {
    generatedAt: new Date().toISOString(),
    sources: [
      "data/stats/theory-shadow-production-gate.json",
      "data/stats/theory-improvement-proposals.json"
    ],
    ...review.build(load(gatePath, {}), load(improvementPath, {}))
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(`理論採用判断レポート：${report.status}`);
}

if (require.main === module) main();
module.exports = { load };
