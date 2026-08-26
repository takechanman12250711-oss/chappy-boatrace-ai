"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const central = fs.readFileSync(
  ".github/workflows/collect-results.yml",
  "utf8",
);
const dedicatedPaths = [
  ".github/workflows/check-exhibition-foot-branch.yml",
  ".github/workflows/refresh-exhibition-foot-branch-report.yml",
];
const builder = "node scripts/build-exhibition-foot-branch-report.js";
const restore = "node scripts/restore-daily-prediction-source.js --all";
const repair = "node scripts/repair-recent-results.js";

assert.ok(
  central.includes(builder),
  "中央writerが展示／足分岐レポートを構築する",
);
assert.ok(central.includes(restore), "中央writerが圧縮正本を復元する");
assert.ok(central.includes(repair), "中央writerが最新の公式結果を修復する");
assert.ok(
  central.indexOf(restore) < central.indexOf(repair) &&
    central.indexOf(repair) < central.indexOf(builder),
  "中央writerは正本復元と結果修復の後に展示／足レポートを構築する",
);
assert.ok(
  central.lastIndexOf(builder) <
    central.lastIndexOf("node scripts/build-learning-analysis-pipeline.js"),
  "中央writerは展示／足レポートを学習派生連鎖より前に構築する",
);
assert.ok(
  central.includes(
    "git add data/results data/stats data/analysis/reference-tag-effectiveness.json",
  ),
  "中央writerが展示／足レポートを公式結果と同じcommitへ保存する",
);

for (const workflowPath of dedicatedPaths) {
  const workflow = fs.readFileSync(workflowPath, "utf8");
  assert.ok(
    workflow.includes("contents: read"),
    `${workflowPath}はread-onlyにする`,
  );
  assert.ok(
    workflow.includes(builder),
    `${workflowPath}は実データ診断としてレポートを構築する`,
  );
  assert.ok(
    workflow.includes(restore) && workflow.indexOf(restore) < workflow.indexOf(builder),
    `${workflowPath}は正本復元後の実データで診断する`,
  );
  assert.ok(
    workflow.includes("group: ${{ github.workflow }}"),
    `${workflowPath}はmain writerのqueueを占有しない`,
  );
  assert.ok(!workflow.includes("git push"), `${workflowPath}はmainへ書き込まない`);
  assert.ok(!workflow.includes("git commit"), `${workflowPath}はcommitを作らない`);
  assert.ok(
    !workflow.includes("prepare-daily-prediction-git-save"),
    `${workflowPath}は保存準備で予想ソースを変更しない`,
  );
}

console.log("exhibition foot writer contract: ok");
