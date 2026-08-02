"use strict";
const fs = require("node:fs");
const path = require("node:path");
const proposals = require("../js/theory-improvement-proposals");

const root = path.resolve(__dirname, "..");
const input = path.join(root, "data", "stats", "theory-performance-report.json");
const output = path.join(root, "data", "stats", "theory-improvement-proposals.json");

function load(filePath, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

function main() {
  const performance = load(input, {});
  const report = {
    generatedAt: new Date().toISOString(),
    source: "data/stats/theory-performance-report.json",
    ...proposals.build(performance)
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(`理論改善提案：${report.proposalCount}件／状態${report.status}`);
}

if (require.main === module) main();
module.exports = { load };
