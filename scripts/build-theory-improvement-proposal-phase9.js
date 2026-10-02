"use strict";

const fs = require("node:fs");
const path = require("node:path");
const phase9 = require("../js/theory-improvement-proposal-phase9");

const root = path.resolve(__dirname, "..");
const stats = path.join(root, "data", "stats");

function load(file, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) { if (error?.code === "ENOENT") return fallback; throw error; }
}

function main() {
  const phase8 = load(path.join(stats, "theory-profit-review-phase8.json"), {});
  const report = {
    generatedAt: new Date().toISOString(),
    source: "theory-profit-review-phase8.json",
    ...phase9.build(phase8)
  };
  fs.mkdirSync(stats, { recursive: true });
  fs.writeFileSync(path.join(stats, "theory-improvement-proposal-phase9.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(`Phase9改善提案：${report.status}／候補${report.proposalCount}`);
}

if (require.main === module) main();
module.exports = { load, main };
