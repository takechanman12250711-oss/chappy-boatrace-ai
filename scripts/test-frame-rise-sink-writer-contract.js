"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const central = fs.readFileSync(
  path.join(root, ".github", "workflows", "collect-results.yml"),
  "utf8",
);
const dedicated = fs.readFileSync(
  path.join(root, ".github", "workflows", "build-frame-rise-sink-stats.yml"),
  "utf8",
);
const restore = "node scripts/restore-daily-prediction-source.js --all";
const repair = "node scripts/repair-recent-results.js";
const builder = "node scripts/build-frame-rise-sink-stats.js";
const collectStart = central.indexOf("- name: Collect official results");
const restoreIndex = central.indexOf(restore, collectStart);
const repairIndex = central.indexOf(repair, collectStart);
const officialSaveStart = central.indexOf(
  "- name: Save official results before calibration",
);
const diagnosticsStart = central.indexOf("- name: Build result diagnostics");
const builderIndex = central.indexOf(builder, diagnosticsStart);
const derivedSaveStart = central.indexOf(
  "- name: Save derived result reports before calibration",
);
const calibrationStart = central.indexOf(
  "- name: Build prediction calibration",
  derivedSaveStart,
);

assert.match(central, /permissions:\s*\n\s*contents: write/);
assert.match(central, /group: chappy-main-data-writers/);
assert.ok(
  collectStart >= 0 &&
    restoreIndex > collectStart &&
    repairIndex > restoreIndex &&
    officialSaveStart > repairIndex &&
    diagnosticsStart > officialSaveStart &&
    builderIndex > diagnosticsStart &&
    derivedSaveStart > builderIndex &&
    calibrationStart > derivedSaveStart,
  "枠別浮沈統計は公式結果の早期保存後に生成し、派生レポート保存へ渡す",
);
assert.match(
  central.slice(derivedSaveStart, calibrationStart),
  /git add data\/results data\/stats/,
  "中央結果収集が枠別浮沈統計をdata/statsとして保存する",
);
assert.match(dedicated, /permissions:\s*\n\s*contents: read/);
assert.match(dedicated, /group: \$\{\{ github\.workflow \}\}/);
assert.ok(dedicated.includes(builder), "専用workflowは実データ診断を維持する");

for (const forbidden of [
  "contents: write",
  "git add",
  "git commit",
  "git push",
  "chappy-main-data-writers",
]) {
  assert.ok(
    !dedicated.includes(forbidden),
    `専用workflowはwriter操作を持たない: ${forbidden}`,
  );
}

console.log("枠別浮沈統計writer契約: 合格");
