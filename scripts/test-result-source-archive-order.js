"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const workflow = fs.readFileSync(
  ".github/workflows/collect-results.yml",
  "utf8",
);
const prepare =
  "node scripts/prepare-daily-prediction-git-save.js --all";
const performance = "node scripts/test-load-performance.js";

function step(name, nextName) {
  const start = workflow.indexOf(`- name: ${name}`);
  const end = nextName
    ? workflow.indexOf(`- name: ${nextName}`, start + 1)
    : workflow.indexOf("\n  calibrate:", start + 1);
  assert.ok(start >= 0 && end > start, `${name}のworkflow範囲を取得する`);
  return workflow.slice(start, end);
}

for (const [name, nextName] of [
  ["Validate result prediction artifacts", null],
  ["Validate calibrated prediction artifacts", "Save calibration and derived data"],
]) {
  const source = step(name, nextName);
  assert.ok(source.includes(prepare), `${name}は最新正本をarchive化する`);
  assert.ok(source.includes(performance), `${name}は分割indexを検証する`);
  assert.ok(
    source.indexOf(prepare) < source.indexOf(performance),
    `${name}は最新正本のarchive化後に分割indexを照合する`,
  );
}

assert.ok(
  workflow.indexOf("- name: Save official results before calibration") <
    workflow.indexOf("- name: Build result diagnostics"),
  "公式結果は重い診断生成より先に保存する",
);

assert.ok(
  workflow.indexOf("- name: Save derived result reports before calibration") <
    workflow.indexOf("- name: Validate result prediction artifacts"),
  "派生レポートは重い予想artifact検査より先に保存する",
);

const save = step(
  "Save official results before calibration",
  "Build result diagnostics",
);
assert.ok(
  save.includes(prepare),
  "検証済みarchiveを公式結果と同じ中央commitへ保存する",
);
assert.match(
  save,
  /git add data\/results(?:\s|$)/,
  "先行checkpointは公式結果を保存対象に含める",
);

const centralRebases =
  workflow.match(
    /git pull --rebase --autostash origin main/g,
  ) || [];
assert.equal(
  centralRebases.length,
  3,
  "中央保存3か所は未保存差分を退避してrebaseする",
);
assert.doesNotMatch(
  workflow,
  /git pull --rebase origin main/,
  "未保存差分を失う通常rebaseを残さない",
);

const diagnostics = step(
  "Build result diagnostics",
  "Build Local Water V2 post-adoption monitor",
);
assert.ok(
  diagnostics.includes("node scripts/build-learning-analysis-pipeline.js"),
  "重い学習分析は公式結果checkpoint後に実行する",
);

const restoreCanonical =
  "node scripts/restore-daily-prediction-source.js --all";
const practicalShadow =
  "node scripts/build-practical-priority-shadow-report.js";
assert.ok(
  diagnostics.includes(restoreCanonical),
  "固定100Rシャドーは保存済みarchive正本を復元して再計算する",
);
assert.ok(
  diagnostics.indexOf(restoreCanonical) <
    diagnostics.indexOf(practicalShadow),
  "固定100Rシャドー生成より先にarchive正本を復元する",
);

console.log("result source archive validation order: ok");
