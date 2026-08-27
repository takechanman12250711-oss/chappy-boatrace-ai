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
  const end = workflow.indexOf(`- name: ${nextName}`, start + 1);
  assert.ok(start >= 0 && end > start, `${name}のworkflow範囲を取得する`);
  return workflow.slice(start, end);
}

for (const [name, nextName] of [
  ["Validate result prediction artifacts", "Save official results before calibration"],
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

const save = step(
  "Save official results before calibration",
  "Build prediction calibration",
);
assert.ok(
  save.includes(prepare),
  "検証済みarchiveを公式結果と同じ中央commitへ保存する",
);

console.log("result source archive validation order: ok");
