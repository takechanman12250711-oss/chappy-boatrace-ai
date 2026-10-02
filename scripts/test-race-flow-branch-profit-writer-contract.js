"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const central = fs.readFileSync(
  path.join(root, ".github", "workflows", "collect-results.yml"),
  "utf8"
);
const dedicated = fs.readFileSync(
  path.join(root, ".github", "workflows", "check-race-flow-branch-profit.yml"),
  "utf8"
);
const builder = "node scripts/build-race-flow-branch-profit-report.js";
const restore = "node scripts/restore-daily-prediction-source.js --all";
const collectStart = central.indexOf("- name: Collect official results");
const restoreIndex = central.indexOf(restore, collectStart);
const builderIndex = central.indexOf(builder, collectStart);
const saveStart = central.indexOf("- name: Save official results before calibration");

assert.ok(
  collectStart >= 0 &&
    restoreIndex > collectStart &&
    builderIndex > restoreIndex &&
    builderIndex < saveStart,
  "race-flow収益レポートは中央結果収集で正本復元後・保存前に生成する"
);
assert.match(
  central.slice(saveStart),
  /git add data\/results data\/stats/,
  "中央結果収集がrace-flow収益レポートをdata\/statsとして保存する"
);
assert.match(dedicated, /permissions:\s*\n\s*contents: read/);
assert.match(dedicated, /group: \$\{\{ github\.workflow \}\}/);
assert.ok(dedicated.includes(builder), "専用workflowは実データ診断を維持する");
for (const forbidden of [
  "git commit",
  "git push",
  "git add data/stats/race-flow-branch-profit-report.json",
  "prepare-daily-prediction-git-save.js",
  "chappy-main-data-writers",
]) {
  assert.ok(
    !dedicated.includes(forbidden),
    `専用workflowはwriter操作を持たない: ${forbidden}`
  );
}

console.log("race-flow収益レポートwriter契約: 合格");
