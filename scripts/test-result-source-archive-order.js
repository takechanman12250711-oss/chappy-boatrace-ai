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
    workflow.indexOf("- name: Validate result prediction artifacts"),
  "公式結果は重い予想artifact検査より先に保存する",
);

const save = step(
  "Save official results before calibration",
  "Validate result prediction artifacts",
);
assert.ok(
  save.includes(prepare),
  "検証済みarchiveを公式結果と同じ中央commitへ保存する",
);

console.log("result source archive validation order: ok");
