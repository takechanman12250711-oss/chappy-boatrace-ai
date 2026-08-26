"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const central = fs.readFileSync(
  ".github/workflows/collect-results.yml",
  "utf8",
);
const skillBuilder = "node scripts/build-skill-branch-report.js";
const motorCourseBuilder = "node scripts/build-motor-course-branch-report.js";

assert.ok(central.includes(skillBuilder));
assert.ok(central.includes(motorCourseBuilder));
assert.ok(
  central.lastIndexOf(skillBuilder) < central.lastIndexOf("node scripts/build-learning-analysis-pipeline.js"),
  "中央writerは観測レポートを学習派生連鎖より前に構築する",
);
assert.ok(
  central.lastIndexOf(skillBuilder) < central.lastIndexOf(motorCourseBuilder),
  "中央writerは技量レポートの後にモーター・コースレポートを構築する",
);
assert.ok(
  central.includes("git add data/results data/stats data/analysis/reference-tag-effectiveness.json"),
  "中央writerが技量・モーター・コース観測レポートを保存する",
);

for (const workflowPath of [
  ".github/workflows/refresh-skill-motor-course-branch-reports.yml",
  ".github/workflows/check-skill-branch.yml",
  ".github/workflows/check-finish-skill-motor-course-observability.yml",
]) {
  const workflow = fs.readFileSync(workflowPath, "utf8");
  assert.ok(workflow.includes("contents: read"), `${workflowPath}はread-onlyにする`);
  assert.ok(
    workflow.includes("group: ${{ github.workflow }}"),
    `${workflowPath}はmain writerのqueueを占有しない`,
  );
  assert.ok(!workflow.includes("git push"), `${workflowPath}はmainへ書き込まない`);
  assert.ok(!workflow.includes("git commit"), `${workflowPath}はcommitを作らない`);
}

console.log("skill motor course writer contract: ok");
