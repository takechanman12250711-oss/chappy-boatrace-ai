"use strict";

const fs = require("node:fs");
const assert = require("node:assert/strict");

const refresh = fs.readFileSync(
  ".github/workflows/refresh-unified-improvement-decision-gate.yml",
  "utf8",
);
assert.ok(refresh.includes("build-unified-improvement-decision-gate.js"));
assert.ok(refresh.includes("build-phase3-learning-handoff.js"));
assert.ok(
  refresh.indexOf("build-unified-improvement-decision-gate.js")
    < refresh.indexOf("build-phase3-learning-handoff.js"),
);
assert.ok(refresh.includes("phase3-learning-handoff.json"));
assert.ok(refresh.includes("data/stats/frame-rise-fall-shadow-result-report.json"));
assert.ok(refresh.includes("pull_request:"));
assert.ok(refresh.includes("workflow_dispatch:"));
assert.ok(!refresh.includes("\n  push:"));
assert.ok(!refresh.includes("\n  workflow_run:"));

const check = fs.readFileSync(
  ".github/workflows/check-phase3-learning-handoff.yml",
  "utf8",
);
assert.ok(check.includes("check-phase3-learning-handoff-pr-{0}"));
assert.ok(check.includes("|| 'chappy-main-data-writers'"));
assert.ok(check.includes("cancel-in-progress: ${{ github.event_name == 'pull_request' }}"));
assert.ok(check.includes("config/phase3-candidate-policy-review.json"));
assert.ok(check.includes("workflow_dispatch:"));
assert.ok(!check.includes("\n  push:"));
assert.ok(!check.includes("\n  workflow_run:"));
assert.ok(check.includes("data/stats/improvement-proposal-phase3.json"));
assert.ok(check.includes("test-phase3-historical-connection.js"));
assert.ok(
  check.indexOf("build-phase3-learning-handoff.js") <
    check.lastIndexOf("test-phase3-historical-connection.js"),
);

const negativeClip = fs.readFileSync(
  ".github/workflows/collect-frame-rise-fall-negative-clip-ab.yml",
  "utf8",
);
assert.ok(!negativeClip.includes("\n  push:"));
assert.ok(negativeClip.includes('workflows:\n      - "Collect automatic race predictions"'));
assert.ok(!negativeClip.includes('      - "Collect official race results"'));
assert.ok(negativeClip.includes('if [ "$GITHUB_EVENT_NAME" = "workflow_dispatch" ]'));

const central = fs.readFileSync(".github/workflows/collect-results.yml", "utf8");
const negativeReport = central.lastIndexOf(
  "node scripts/build-frame-rise-fall-negative-clip-result-report.js",
);
const unifiedGate = central.lastIndexOf(
  "node scripts/build-unified-improvement-decision-gate.js",
);
const learningPipeline = central.lastIndexOf(
  "node scripts/build-learning-analysis-pipeline.js",
);
const phase3Handoff = central.lastIndexOf(
  "node scripts/build-phase3-learning-handoff.js",
);
const phase4Gate = central.lastIndexOf(
  "node scripts/build-phase4-daily-cycle-gate.js",
);
assert.ok(negativeReport < unifiedGate);
assert.ok(unifiedGate < phase3Handoff);
assert.ok(learningPipeline < phase3Handoff);
assert.ok(phase3Handoff < phase4Gate);
assert.ok(
  fs.readFileSync("scripts/build-learning-analysis-pipeline.js", "utf8")
    .includes('"build-improvement-proposal-report.js"'),
);

for (const workflowPath of [
  ".github/workflows/check-unified-improvement-decision-gate.yml",
  ".github/workflows/check-phase4-daily-cycle-gate.yml",
  ".github/workflows/build-learning-analysis-pipeline.yml",
]) {
  const workflow = fs.readFileSync(workflowPath, "utf8");
  assert.ok(
    !workflow.includes("git push origin main"),
    `${workflowPath}は自動・手動とも診断専用にする`,
  );
  assert.ok(
    workflow.includes("group: ${{ github.workflow }}"),
    `${workflowPath}のread-only検証はmain writerを占有しない`,
  );
  assert.ok(workflow.includes("contents: read"));
}
assert.ok(
  central.includes("git add data/results data/stats data/analysis/reference-tag-effectiveness.json"),
  "中央writerが学習パイプラインの分析出力も保存する",
);
console.log("phase3 refresh contract: ok");
