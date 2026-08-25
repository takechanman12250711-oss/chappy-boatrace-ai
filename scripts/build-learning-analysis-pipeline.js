"use strict";

const { execFileSync } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const steps = [
  "build-result-review.js",
  "build-theory-evaluations.js",
  "build-miss-cause-analysis.js",
  "build-improvement-proposal-report.js",
  "build-theory-performance-report.js",
  "analyze-reference-tag-effectiveness.js",
  "build-theory-evidence-coverage-phase7.js",
  "build-theory-evidence-growth-monitor.js",
  "build-theory-adoption-phase5.js",
  "build-profit-priority-ranking.js",
  "build-theory-profit-review-phase8.js",
  "build-theory-improvement-proposal-phase9.js",
  "build-theory-candidate-branch-analysis-phase9.js",
  "build-theory-ab-phase10.js",
  "build-learning-pipeline-gate.js",
  "build-phase6-data-audit.js"
];

function run() {
  steps.forEach(file => {
    console.log(`学習分析パイプライン: ${file}`);
    execFileSync(process.execPath, [path.join(root, "scripts", file)], {
      cwd: root,
      stdio: "inherit"
    });
  });
}

if (require.main === module) run();
module.exports = { steps, run };
