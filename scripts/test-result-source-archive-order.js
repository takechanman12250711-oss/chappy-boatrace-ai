"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const workflow = fs.readFileSync(
  ".github/workflows/collect-results.yml",
  "utf8",
);
const prepare =
  "node scripts/prepare-daily-prediction-git-save.js --all";
const cleanup =
  "node scripts/prepare-daily-prediction-git-save.js --cleanup-restored --all";
const performance = "node scripts/test-load-performance.js";

function step(name, nextName) {
  const start = workflow.indexOf(`- name: ${name}`);
  const end = nextName
    ? workflow.indexOf(`- name: ${nextName}`, start + 1)
    : workflow.indexOf("- name: Package verified diagnostics reports", start + 1);
  assert.ok(start >= 0 && end > start, `${name}のworkflow範囲を取得する`);
  return workflow.slice(start, end);
}

for (const [name, nextName] of [
  ["Validate result prediction artifacts", null],
  ["Validate calibrated prediction artifacts", "Save calibration and derived data"],
]) {
  const source = step(name, nextName);
  assert.ok(source.includes(cleanup), `${name}は診断用復元原本を片付ける`);
  assert.ok(source.includes(performance), `${name}は分割indexを検証する`);
  assert.ok(
    source.indexOf(cleanup) < source.indexOf(performance),
    `${name}は復元原本の片付け後に分割indexを照合する`,
  );
}

assert.ok(
  workflow.indexOf("- name: Save official results before calibration") <
    workflow.indexOf("- name: Build result diagnostics"),
  "公式結果は重い診断生成より先に保存する",
);

assert.ok(
  workflow.indexOf("- name: Validate result prediction artifacts") <
    workflow.indexOf("- name: Save derived result reports before calibration"),
  "派生レポートは共有writerキュー外の検査に合格してから保存する",
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

assert.equal((workflow.match(/git rebase --autostash origin\/main/g) || []).length, 1,
  "公式原本は検査済みremote refへだけrebaseする");
assert.ok(save.indexOf('result-source-checkpoint.cjs guard-push') < save.indexOf('git rebase --autostash origin/main'),
  "push直前に公式原本・code・receiptの競合を確認する");
assert.doesNotMatch(workflow, /git pull --rebase/, "検査後の再fetchで競合検査を迂回しない");

assert.equal((workflow.match(/result-report-checkpoint.cjs publish /g) || []).length, 2,
  "診断と校正は元blobの比較を通して保存する");
const diagnostics = step(
  "Restore saved result sources",
  "Build Local Water V2 post-adoption monitor",
);
const diagnosticsJobStart = workflow.indexOf("\n  diagnostics:\n");
const diagnosticsJobEnd = workflow.indexOf("\n  publish_diagnostics:\n");
const diagnosticsJob = workflow.slice(diagnosticsJobStart, diagnosticsJobEnd);
assert.ok(
  diagnostics.includes("node scripts/build-learning-analysis-pipeline.js"),
  "重い学習分析は公式結果checkpoint後に実行する",
);
assert.match(
  diagnosticsJob,
  /timeout-minutes: 150/,
  "実測75〜85分（2026-10-28）の診断に片付け・検証・artifact保存の余裕を確保する",
);
assert.doesNotMatch(
  diagnostics,
  /node scripts\/build-prediction-index-shards\.js/,
  "公式結果checkpointで生成済みの予想indexを診断jobで重複再構築しない",
);
const collect = step(
  "Collect official results",
  "Save official results before calibration",
);
assert.match(
  collect,
  /node scripts\/build-prediction-index-shards\.js/,
  "予想indexは公式結果checkpointの入力で一度だけ再構築する",
);

const restoreCanonical =
  "node scripts/restore-daily-prediction-source.js --all";
const practicalShadow =
  "node scripts/build-practical-priority-shadow-report.js";
assert.ok(
  diagnostics.includes(restoreCanonical),
  "診断は保存済みarchive正本を復元して再計算する",
);
assert.ok(
  diagnostics.indexOf(restoreCanonical) <
    diagnostics.indexOf(practicalShadow),
  "固定100Rシャドー生成より先にarchive正本を復元する",
);
assert.equal(
  (diagnostics.match(/restore-daily-prediction-source\.js --all/g) || []).length,
  1,
  "同じ診断job内で全期間原本を重複復元しない",
);

console.log("result source archive validation order: ok");
