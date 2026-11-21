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
const verifyCommand =
  "node scripts/prepare-daily-prediction-git-save.js --verify-prepared";
const restoreCommand =
  "node scripts/restore-daily-prediction-source.js --all";
const performanceCommand =
  "node scripts/test-load-performance.js";
const validationStart = workflow.indexOf(
  "- name: Validate generated prediction artifacts"
);
const saveStepStart = workflow.indexOf(
  "- name: Save predictions and note drafts"
);
const validationPrepareIndex = workflow.indexOf(
  prepareCommand,
  validationStart
);
const validationPerformanceIndex = workflow.indexOf(
  performanceCommand,
  validationStart
);
const validationArtifactIndex = workflow.indexOf(
  "node scripts/test-practical-priority-shadow-artifact.js",
  validationStart
);
const legacyIndexFreezeIndex = workflow.indexOf(
  "git diff --exit-code -- data/predictions/index.json",
  validationStart
);
const saveIndex = workflow.indexOf(
  verifyCommand,
  saveStepStart
);
const saveCommitIndex = workflow.indexOf(
  'git commit -m "Collect automatic race prediction"',
  saveStepStart
);
const postSaveRestoreIndex =
  workflow.lastIndexOf(restoreCommand);
const finalPerformanceIndex =
  workflow.lastIndexOf(performanceCommand);

assert.ok(
  validationStart >= 0 &&
    validationPrepareIndex > validationStart &&
    validationPrepareIndex < saveStepStart &&
    validationPerformanceIndex >
      validationPrepareIndex &&
    validationPerformanceIndex < saveStepStart,
  "生成した最新原本をarchiveへ固定してから分割indexを検証する"
);
assert.ok(
  saveStepStart >= 0 && saveIndex > saveStepStart &&
    saveCommitIndex > saveIndex,
  "保存前に検証済みstageと作業ツリーの一致を読み取り専用で確認する"
);
assert.equal(
  workflow.indexOf(prepareCommand, saveStepStart),
  -1,
  "検証後に全日次原本を再圧縮・再stageしない"
);
assert.ok(
  validationArtifactIndex > validationPerformanceIndex &&
    legacyIndexFreezeIndex > validationArtifactIndex &&
    legacyIndexFreezeIndex < saveStepStart,
  "artifact検査とlegacy index凍結を保存前に維持する"
);
assert.ok(
  postSaveRestoreIndex > saveCommitIndex,
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
