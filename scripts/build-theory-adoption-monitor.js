"use strict";

const fs = require("node:fs");
const path = require("node:path");
const monitor = require("../js/theory-adoption-monitor");

const root = path.resolve(__dirname, "..");
function load(relative, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(path.join(root, relative), "utf8")); }
  catch (error) { if (error?.code === "ENOENT") return fallback; throw error; }
}

function main() {
  const rollout = load("data/stats/theory-adoption-rollout-status.json", {});
  const abReport = load("data/stats/theory-shadow-ab-report.json", {});
  const report = { generatedAt: new Date().toISOString(), ...monitor.build(rollout, abReport) };
  const output = path.join(root, "data/stats/theory-adoption-monitor.json");
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(`理論補正監視：${report.status}`);
}

if (require.main === module) main();
