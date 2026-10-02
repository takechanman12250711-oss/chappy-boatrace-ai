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
  "- name: Save official results before calibration",
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
  "救済monitorは中央結果収集で正本復元・結果修復後、保存前に固定順生成する",
);
assert.ok(
  calibrationStart > saveStart,
  "中央結果収集の保存範囲を特定できる",
);
assert.match(
  central.slice(saveStart, calibrationStart),
  /git add data\/results data\/stats/,
  "中央writerが2つの救済monitorを公式結果と同じcommitへ保存する",
);
const saveStep = central.slice(saveStart, calibrationStart);
assert.ok(
  saveStep.includes('git commit -m "Collect official race results"') &&
    saveStep.includes("git push origin main"),
  "中央writerが公式結果commitをmainへ保存する",
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
  assert.ok(workflow.includes(restore));
  assert.ok(workflow.includes(contract));
  assert.ok(
    workflow.includes(builder) &&
      workflow.indexOf(restore) < workflow.indexOf(builder),
    "専用workflowは実データのread-only診断を維持する",
  );
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
