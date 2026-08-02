"use strict";

const fs = require("node:fs");
const path = require("node:path");
const monitor = require("../js/scenario-ai-v6-monitor");

const ROOT = path.resolve(__dirname, "..");
function load(relative, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, relative), "utf8")); }
  catch (error) { if (error?.code === "ENOENT") return fallback; throw error; }
}

function main() {
  const rollout = load("data/stats/scenario-ai-v6-rollout-status.json", {});
  const abReport = load("data/stats/scenario-ai-v6-ab-report.json", {});
  const report = { generatedAt: new Date().toISOString(), ...monitor.build(rollout, abReport) };
  const output = path.join(ROOT, "data/stats/scenario-ai-v6-monitor.json");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(`展開AI v6監視：${report.status}`);
}

if (require.main === module) main();
module.exports = { main };
