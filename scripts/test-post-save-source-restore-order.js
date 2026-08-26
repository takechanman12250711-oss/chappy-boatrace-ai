"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const workflowPath = path.join(
  __dirname,
  "..",
  ".github",
  "workflows",
  "collect-predictions.yml"
);
const workflow = fs.readFileSync(
  workflowPath,
  "utf8"
);
const prepareCommand =
  "node scripts/prepare-daily-prediction-git-save.js --all";
const restoreCommand =
  "node scripts/restore-daily-prediction-source.js --all";
const performanceCommand =
  "node scripts/test-load-performance.js";
const saveIndex = workflow.indexOf(
  prepareCommand
);
const postSaveRestoreIndex =
  workflow.lastIndexOf(restoreCommand);
const finalPerformanceIndex =
  workflow.lastIndexOf(performanceCommand);

assert.ok(
  saveIndex >= 0,
  "復元した全日次予想原本のGit保存準備が必要"
);
assert.ok(
  postSaveRestoreIndex > saveIndex,
  "圧縮保存後の回帰テスト前に全期間の正本を再復元する"
);
assert.ok(
  finalPerformanceIndex >
    postSaveRestoreIndex,
  "分割index比較は最新原本の再復元後に実行する"
);

const noncriticalStart = workflow.indexOf(
  "- name: Run noncritical regression checks"
);
assert.ok(
  noncriticalStart >= 0 &&
  postSaveRestoreIndex > noncriticalStart,
  "再復元は保存後の回帰チェック内で実行する"
);

const liveCollectionStart = workflow.indexOf(
  "- name: Compare and predict live races"
);
const firstFullRestoreIndex = workflow.indexOf(
  restoreCommand
);
const firstIndexBuild = workflow.indexOf(
  "node scripts/build-prediction-index-shards.js"
);
assert.ok(
  liveCollectionStart >= 0 &&
    firstFullRestoreIndex > liveCollectionStart &&
    firstIndexBuild > firstFullRestoreIndex,
  "全期間indexは全圧縮正本の復元後に再構築する"
);
assert.ok(
  workflow.slice(
    noncriticalStart,
    postSaveRestoreIndex
  ).includes(
    "PREDICT_DATE: ${{ inputs.date }}"
  ),
  "手動指定日も同じ日次原本を再復元する"
);

console.log(
  "圧縮保存後の日次予想原本再復元順序テスト: 合格"
);
