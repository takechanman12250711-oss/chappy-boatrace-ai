"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const readWorkflow = (name) =>
  fs.readFileSync(path.join(root, ".github", "workflows", name), "utf8");
const central = readWorkflow("collect-results.yml");
const dedicated = [
  readWorkflow("check-local-water-branch.yml"),
  readWorkflow("refresh-local-water-branch-report.yml"),
];
const builder = "node scripts/build-local-water-branch-report.js";
const restore = "node scripts/restore-daily-prediction-source.js --all";
const collectStart = central.indexOf("- name: Collect official results");
const restoreIndex = central.indexOf(restore, collectStart);
const officialSaveStart = central.indexOf(
  "- name: Save official results before calibration",
);
const diagnosticsStart = central.indexOf("- name: Build result diagnostics");
const builderIndex = central.indexOf(builder, diagnosticsStart);
const derivedSaveStart = central.indexOf(
  "- name: Save derived result reports before calibration",
);

assert.ok(
  collectStart >= 0 &&
    restoreIndex > collectStart &&
    officialSaveStart > restoreIndex &&
    diagnosticsStart > officialSaveStart &&
    builderIndex > diagnosticsStart &&
    derivedSaveStart > builderIndex,
  "当地・水面レポートは公式結果の早期保存後に生成し、派生レポート保存へ渡す"
);
assert.match(
  central.slice(derivedSaveStart),
  /git add data\/results data\/stats/,
  "中央結果収集が当地・水面レポートをdata\/statsとして保存する"
);

for (const workflow of dedicated) {
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
  assert.match(workflow, /group: \$\{\{ github\.workflow \}\}/);
  assert.ok(workflow.includes(builder), "専用workflowは実データ診断を維持する");
  for (const forbidden of [
    "git commit",
    "git push",
    "git add data/stats/local-water-branch-report.json",
    "prepare-daily-prediction-git-save.js",
    "chappy-main-data-writers",
  ]) {
    assert.ok(
      !workflow.includes(forbidden),
      `専用workflowはwriter操作を持たない: ${forbidden}`
    );
  }
}

console.log("当地・水面レポートwriter契約: 合格");
