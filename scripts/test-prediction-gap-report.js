"use strict";

const assert = require("node:assert/strict");
const report = require("./build-prediction-gap-report");

const output = report.build({
  proposals: [
    {
      id: "wind-gap",
      category: "当地・水面",
      target: "向かい風5m以上",
      issue: "波乱入口を過小評価",
      sampleSize: 80,
      gap: -14,
      confidence: 75,
      recommendation: "配点変更候補として確認"
    },
    {
      id: "small-sample",
      category: "モーター",
      target: "新エンジン初期",
      sampleSize: 5,
      gap: 3,
      confidence: 20
    }
  ]
});

assert.equal(output.mode, "analysis_only");
assert.equal(output.predictionLogicChanged, false);
assert.equal(output.ticketSelectionChanged, false);
assert.equal(output.approvalRequired, true);
assert.equal(output.autoApply, false);
assert.equal(output.candidateCount, 2);
assert.equal(output.candidates[0].id, "wind-gap");
assert.equal(output.candidates[0].status, "candidate_only");
assert.ok(output.candidates[0].priorityScore > output.candidates[1].priorityScore);

console.log("予想精度改善候補レポートテスト: 合格");
