"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const workflow = fs.readFileSync(
  path.join(root, ".github", "workflows", "settle-purchases.yml"),
  "utf8"
);

assert.match(
  workflow,
  /cron:\s*["']\*\/5 \* \* \* \*["']/,
  "既存workflowの5分間隔を維持する"
);
assert.match(
  workflow,
  /\/api\/settle-purchases/,
  "購入照合APIの既存呼び出しを維持する"
);

const collectorIndex = workflow.indexOf("/api/collect-final-odds");
assert.ok(collectorIndex >= 0, "最終オッズ収集APIを呼び出す");

const collectorStepStart = workflow.lastIndexOf("- name:", collectorIndex);
const collectorStep = workflow.slice(collectorStepStart);
assert.match(
  collectorStep,
  /secrets\.CHAPPY_API_BASE_URL/,
  "既存のAPI接続先を使用する"
);
assert.match(
  collectorStep,
  /secrets\.CHAPPY_PURCHASE_SYNC_TOKEN/,
  "既存の同期トークンを使用する"
);
assert.match(
  collectorStep,
  /Authorization: Bearer \$\{SYNC_TOKEN\}/,
  "収集APIへBearer認証を付ける"
);
assert.doesNotMatch(
  collectorStep,
  /-X\s+POST/,
  "収集APIはGETで呼び出す"
);
assert.ok(
  collectorIndex > workflow.indexOf("/api/settle-purchases"),
  "既存の購入照合後に収集を実行する"
);

console.log("final odds schedule regression: passed");
