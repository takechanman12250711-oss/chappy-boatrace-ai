"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const readWorkflow = name => fs.readFileSync(
  path.join(root, ".github", "workflows", name),
  "utf8",
);
const triggerBlock = (workflow, startMarker, endMarker) => {
  const start = workflow.indexOf(startMarker);
  const end = workflow.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `trigger範囲を特定できる: ${startMarker}`);
  return workflow.slice(start, end);
};
const central = readWorkflow("collect-results.yml");
const restore = "node scripts/restore-daily-prediction-source.js --all";
const repair = "node scripts/repair-recent-results.js";
const canonicalVerification = "node scripts/test-escape-rescue-canonical-sources.cjs";
const threeCourseBuilder = "node scripts/monitor-three-course-escape-rescue.js";
const fourKadoBuilder = "node scripts/monitor-four-kado-escape-rescue.js";
const dedicatedWorkflows = [
  {
    workflowName:
      "check-three-course-escape-rescue-post-adoption-monitor.yml",
    workflow: readWorkflow(
      "check-three-course-escape-rescue-post-adoption-monitor.yml",
    ),
    builder: threeCourseBuilder,
    fixedModule: "js/three-course-escape-rescue-fixed5.js",
  },
  {
    workflowName:
      "check-four-kado-escape-rescue-post-adoption-monitor.yml",
    workflow: readWorkflow(
      "check-four-kado-escape-rescue-post-adoption-monitor.yml",
    ),
    builder: fourKadoBuilder,
    fixedModule: "js/four-kado-escape-rescue-fixed5.js",
  },
];
const contract =
  "node scripts/test-escape-rescue-post-adoption-monitor-writer-contract.js";
const verifyStart = central.indexOf("- name: Verify result merge safety");
const collectStart = central.indexOf("- name: Collect official results");
const restoreIndex = central.indexOf(restore, collectStart);
const repairIndex = central.indexOf(repair, collectStart);
const threeCourseIndex = central.indexOf(threeCourseBuilder, collectStart);
const fourKadoIndex = central.indexOf(fourKadoBuilder, collectStart);
const saveStart = central.indexOf(
  "- name: Save derived result reports before calibration",
  collectStart,
);
const calibrationStart = central.indexOf(
  "- name: Build prediction calibration",
  saveStart,
);

assert.match(central, /permissions:\s*\n\s*contents: write/);
assert.match(central, /group: chappy-main-data-writers/);
for (const trackedPath of [
  ".github/workflows/check-three-course-escape-rescue-post-adoption-monitor.yml",
  ".github/workflows/check-four-kado-escape-rescue-post-adoption-monitor.yml",
  "js/practical-selection.js",
  "js/boat-identity.js",
  "js/ai-core.js",
  "js/prediction.js",
  "js/evaluated-scenario-candidates.js",
  "js/three-course-escape-rescue-fixed5.js",
  "js/four-kado-escape-rescue-fixed5.js",
  "scripts/monitor-three-course-escape-rescue.js",
  "scripts/monitor-four-kado-escape-rescue.js",
  "scripts/test-escape-rescue-post-adoption-monitor-writer-contract.js",
]) {
  assert.ok(
    central.includes(`- "${trackedPath}"`),
    `中央writerを関連変更後に起動する: ${trackedPath}`,
  );
}
assert.ok(
  verifyStart >= 0 && verifyStart < collectStart,
  "中央結果収集の事前安全検証範囲を特定できる",
);
const verification = central.slice(verifyStart, collectStart);
for (const command of [
  "node --check scripts/monitor-three-course-escape-rescue.js",
  "node --check scripts/monitor-four-kado-escape-rescue.js",
  contract,
]) {
  assert.ok(verification.includes(command), `中央事前検証が実行する: ${command}`);
}
assert.ok(
  collectStart >= 0 &&
    restoreIndex > collectStart &&
    repairIndex > restoreIndex &&
    threeCourseIndex > repairIndex &&
    fourKadoIndex > threeCourseIndex &&
    fourKadoIndex < saveStart,
  "救済monitorは正本復元・結果修復・公式結果先行保存後、派生保存前に固定順生成する",
);
assert.ok(
  calibrationStart > saveStart,
  "中央結果収集の保存範囲を特定できる",
);
assert.match(
  central.slice(saveStart, calibrationStart),
  /result-report-checkpoint.cjs publish diagnostics/,
  "中央writerが2つの救済monitorを公式結果と同じcommitへ保存する",
);
const saveStep = central.slice(saveStart, calibrationStart);
assert.ok(
  saveStep.includes("result-report-checkpoint.cjs publish diagnostics") &&
    central.includes("artifact-ids: ${{ needs.diagnostics.outputs.artifact_id }}"),
  "中央writerが検査済みartifactを元blob照合後にmainへ保存する",
);

for (const {
  workflowName,
  workflow,
  builder,
  fixedModule,
} of dedicatedWorkflows) {
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
  assert.match(
    workflow,
    /group: \$\{\{ github\.event_name == 'pull_request'.*github\.event\.pull_request\.number.*github\.ref.*\}\}/,
  );
  assert.match(workflow, /persist-credentials: false/);
  const triggerPaths = [
    "js/practical-selection.js",
    "js/boat-identity.js",
    "js/ai-core.js",
    "js/prediction.js",
    "js/evaluated-scenario-candidates.js",
    fixedModule,
    builder.slice("node ".length),
    contract.slice("node ".length),
    "scripts/restore-daily-prediction-source.js",
    "scripts/strong-escape-monitor-sources.cjs",
    "scripts/daily-prediction-source-archive.js",
    "scripts/test-escape-rescue-canonical-sources.cjs",
    "scripts/fixtures/three-course-escape-rescue-before-source-streaming.js",
    "scripts/fixtures/four-kado-escape-rescue-before-source-streaming.js",
    `.github/workflows/${workflowName}`,
    ".github/workflows/collect-results.yml",
  ];
  for (const eventPaths of [
    triggerBlock(workflow, "  pull_request:", "  push:"),
    triggerBlock(workflow, "  push:", "  workflow_dispatch:"),
  ]) {
    for (const trackedPath of triggerPaths) {
      assert.ok(
        eventPaths.includes(`- "${trackedPath}"`),
        `専用workflowを関連変更後に起動する: ${trackedPath}`,
      );
    }
  }
  const canonicalBuilder = builder + " --canonical-sources";
  assert.ok(workflow.includes(canonicalVerification));
  assert.ok(!workflow.includes(restore), "専用CIは検証済み巨大rawを書き出さない");
  assert.ok(workflow.includes(contract));
  assert.ok(workflow.split("\n").map(line => line.trim()).includes(canonicalBuilder) && workflow.indexOf(canonicalVerification) < workflow.indexOf(canonicalBuilder),
    "専用workflowは全canonical原本の同値検証後にread-only診断を行う");
  assert.ok(central.split("\n").map(line => line.trim()).includes(builder) && !central.includes(canonicalBuilder), "中央writerの既存raw読取モードを変更しない");
  assert.match(workflow, /^\s+git diff --check\s*$/m, "コードと派生reportの差分検査を除外なしで維持する");
  assert.ok(workflow.includes("/data/stats/" + workflowName.slice(6, -4) + ".json"), "派生reportをsparse内へ保持して差分検査を有効にする");
  for (const forbidden of [
    "contents: write",
    "git add",
    "git commit",
    "git push",
    "chappy-main-data-writers",
  ]) {
    assert.ok(
      !workflow.includes(forbidden),
      `専用workflowはwriter操作を持たない: ${forbidden}`,
    );
  }
}

console.log("逃げ救済post-adoption monitor writer契約: 合格");
