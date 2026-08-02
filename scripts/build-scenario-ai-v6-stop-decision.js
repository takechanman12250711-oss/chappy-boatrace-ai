"use strict";

const fs = require("node:fs");
const path = require("node:path");
const decision = require("../js/scenario-ai-v6-stop-decision");

const ROOT = path.resolve(__dirname, "..");
const STATS = path.join(ROOT, "data", "stats");
const OUTPUT = path.join(STATS, "scenario-ai-v6-stop-decision.json");

function load(name) {
  try { return JSON.parse(fs.readFileSync(path.join(STATS, name), "utf8")); }
  catch (error) { if (error?.code === "ENOENT") return {}; throw error; }
}

function main() {
  const report = {
    generatedAt: new Date().toISOString(),
    ...decision.build(
      load("scenario-ai-v6-approval-status.json"),
      load("scenario-ai-v6-rollout-status.json"),
      load("scenario-ai-v6-monitor.json")
    )
  };
  fs.mkdirSync(STATS, { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(`展開AI v6停止判断：${report.status}`);
}

if (require.main === module) main();
module.exports = { main };
