"use strict";

const fs = require("node:fs");
const path = require("node:path");
const report = require("../js/theory-stop-decision-report");

const root = path.resolve(__dirname, "..");
const statsDir = path.join(root, "data", "stats");
const output = path.join(statsDir, "theory-stop-decision-report.json");

function load(name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(statsDir, name), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw error;
  }
}

function main() {
  const result = {
    generatedAt: new Date().toISOString(),
    ...report.build(
      load("theory-adoption-approval-status.json"),
      load("theory-adoption-rollout.json"),
      load("theory-adoption-monitor.json")
    )
  };
  fs.mkdirSync(statsDir, { recursive: true });
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + "\n", "utf8");
  console.log(`停止判断統合レポート：${result.status}`);
}

if (require.main === module) main();
module.exports = { main };
