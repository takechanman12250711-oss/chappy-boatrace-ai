"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const readWorkflow = (name) => fs.readFileSync(
  path.join(root, ".github", "workflows", name),
  "utf8",
);
const central = readWorkflow("collect-results.yml");
const dedicated = readWorkflow("build-scenario-ai-v6-monitor.yml");
const check = readWorkflow("check-scenario-ai-v6-monitor.yml");
const abBuilder = "node scripts/build-scenario-ai-v6-ab-report.js";
const rolloutBuilder = "node scripts/build-scenario-ai-v6-rollout-status.js";
const monitorTest = "node scripts/test-scenario-ai-v6-monitor.js";
const monitorBuilder = "node scripts/build-scenario-ai-v6-monitor.js";
const stopTest = "node scripts/test-scenario-ai-v6-stop-decision.js";
const stopBuilder = "node scripts/build-scenario-ai-v6-stop-decision.js";
const buildStart = central.indexOf("- name: Build prediction calibration");
const validateStart = central.indexOf(
  "- name: Validate calibrated prediction artifacts",
  buildStart,
);
const calibration = central.slice(buildStart, validateStart);
const saveStart = central.indexOf("- name: Save calibration and derived data");
const performanceStart = central.indexOf(
  "- name: Run noncritical performance check",
  saveStart,
);

assert.match(central, /permissions:\s*\n\s*contents: write/);
assert.match(central, /group: chappy-main-data-writers/);
assert.ok(
  buildStart >= 0 && validateStart > buildStart,
  "中央校正の生成範囲を特定できる",
);
for (const command of [
  abBuilder,
  rolloutBuilder,
  monitorTest,
  monitorBuilder,
  stopTest,
  stopBuilder,
]) {
  assert.ok(calibration.includes(command), `中央校正が実行する: ${command}`);
}
assert.ok(
  calibration.indexOf(abBuilder) < calibration.indexOf(rolloutBuilder) &&
    calibration.indexOf(rolloutBuilder) < calibration.indexOf(monitorTest) &&
    calibration.indexOf(monitorTest) < calibration.indexOf(monitorBuilder) &&
    calibration.indexOf(monitorBuilder) < calibration.indexOf(stopTest) &&
    calibration.indexOf(stopTest) < calibration.indexOf(stopBuilder),
  "Scenario AI v6をAB→rollout→monitor→stop-decisionの固定順で生成する",
);
assert.ok(
  saveStart > validateStart && performanceStart > saveStart,
  "中央校正の保存範囲を特定できる",
);
assert.match(
  central.slice(saveStart, performanceStart),
  /git add data\/results data\/stats/,
  "中央writerがmonitorを校正・派生データと同じcommitへ保存する",
);

assert.match(dedicated, /permissions:\s*\n\s*contents: read/);
assert.match(dedicated, /group: \$\{\{ github\.workflow \}\}/);
assert.ok(dedicated.includes(monitorTest));
assert.ok(dedicated.includes(monitorBuilder));
for (const forbidden of [
  "contents: write",
  "git add",
  "git commit",
  "git push",
  "chappy-main-data-writers",
]) {
  assert.ok(
    !dedicated.includes(forbidden),
    `専用monitor workflowはwriter操作を持たない: ${forbidden}`,
  );
}

assert.ok(
  check.includes("node scripts/test-scenario-ai-v6-monitor-writer-contract.js"),
  "PR検査がwriter契約を実行する",
);

console.log("Scenario AI v6 monitor writer契約: 合格");
