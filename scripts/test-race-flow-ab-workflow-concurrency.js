"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const workflows = [
  ["check-race-flow-4kado-alert-skip-ab.yml", "build-race-flow-4kado-alert-skip-ab-report.js"],
  ["check-race-flow-3course-alert-skip-ab.yml", "build-race-flow-3course-alert-skip-ab-report.js"],
  ["check-race-flow-2course-sashi-skip-ab.yml", "build-race-flow-2course-sashi-skip-ab-report.js"],
  ["check-race-flow-outside-push-skip-ab.yml", "build-race-flow-outside-push-skip-ab-report.js"],
  ["check-race-flow-in-first-outside-alert-skip-ab.yml", "build-race-flow-in-first-outside-alert-skip-ab-report.js"],
  ["check-remain-pickup-hold3-shadow-ab.yml", "build-remain-pickup-hold3-shadow-ab.js"]
];
const central = fs.readFileSync(path.join(".github", "workflows", "collect-results.yml"), "utf8");
const gateIndex = central.indexOf("node scripts/build-unified-improvement-decision-gate.js");
const handoffIndex = central.indexOf("node scripts/build-phase3-learning-handoff.js", gateIndex);

for (const [name, builder] of workflows) {
  const workflow = fs.readFileSync(path.join(".github", "workflows", name), "utf8");
  assert.match(
    workflow,
    /group: \$\{\{ github\.event_name == 'pull_request' && format\('\{0\}-pr-\{1\}', github\.workflow, github\.event\.pull_request\.number\) \|\| 'chappy-main-data-writers' \}\}/,
    `${name}はPR検査同士をcancelせず、main書込みだけを直列化する`
  );
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /node scripts\/test-race-flow-ab-workflow-concurrency\.js/);
  assert.ok(!workflow.includes("\n  push:"), `${name}はmainへ自動重複書込みしない`);
  assert.ok(!workflow.includes("\n  workflow_run:"), `${name}は公式結果後の重複writerにならない`);
  assert.ok(workflow.includes("\n  workflow_dispatch:"), `${name}の手動診断は保持する`);
  const builderIndex = central.indexOf(`node scripts/${builder}`);
  assert.ok(builderIndex >= 0 && builderIndex < gateIndex, `${builder}は統一採否ゲート前に主系統で更新する`);
}
assert.ok(gateIndex >= 0 && handoffIndex > gateIndex, "統一採否ゲート後にPhase3 handoffを更新する");

console.log("race-flow A/B workflow single-writer test: ok");
