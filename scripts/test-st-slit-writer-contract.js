"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const central = fs.readFileSync(
  ".github/workflows/collect-results.yml",
  "utf8",
);
const dedicated = fs.readFileSync(
  ".github/workflows/check-st-slit-branch-profit.yml",
  "utf8",
);
const builder = "node scripts/build-st-slit-branch-profit-report.js";
const restore = "node scripts/restore-daily-prediction-source.js --all";
const repair = "node scripts/repair-recent-results.js";

assert.ok(
  central.includes(builder),
  "中央writerがST／スリット分岐収益レポートを構築する",
);
assert.ok(central.includes(restore), "中央writerが圧縮正本を復元する");
assert.ok(central.includes(repair), "中央writerが最新の公式結果を修復する");
assert.ok(
  central.indexOf(restore) < central.indexOf(repair) &&
    central.indexOf(repair) < central.indexOf(builder),
  "中央writerは正本復元と結果修復の後にST／スリット観測レポートを構築する",
);
assert.ok(
  central.lastIndexOf(builder) <
    central.lastIndexOf("node scripts/build-learning-analysis-pipeline.js"),
  "中央writerはST／スリット観測レポートを学習派生連鎖より前に構築する",
);
assert.ok(
  central.includes(
    "git add data/results data/stats data/analysis/reference-tag-effectiveness.json",
  ),
  "中央writerがST／スリット観測レポートを保存する",
);

assert.ok(dedicated.includes("contents: read"), "専用workflowはread-onlyにする");
assert.ok(
  dedicated.includes(builder),
  "専用workflowはread-only診断として実データを構築する",
);
assert.ok(
  dedicated.includes(restore) &&
    dedicated.indexOf(restore) < dedicated.indexOf(builder),
  "専用workflowは正本復元後の実データでread-only診断する",
);
assert.ok(
  dedicated.includes("group: ${{ github.workflow }}"),
  "専用workflowはmain writerのqueueを占有しない",
);
assert.ok(!dedicated.includes("git push"), "専用workflowはmainへ書き込まない");
assert.ok(!dedicated.includes("git commit"), "専用workflowはcommitを作らない");
assert.ok(
  !dedicated.includes("prepare-daily-prediction-git-save"),
  "専用workflowは保存準備で予想ソースを変更しない",
);

console.log("ST slit writer contract: ok");
