"use strict";

const fs = require("node:fs");
const path = require("node:path");

const testPath = path.resolve(__dirname, "test-prediction-transparency-ui.js");
let source = fs.readFileSync(testPath, "utf8");

const oldReasonAssertion = `assert.match(\n  html,\n  /【ランキング固有理由末尾】/,\n  "ランキング行は順位データの固有理由を優先して全文表示する"\n);\n`;

const newReasonAssertion = `assert.doesNotMatch(\n  html,\n  /AI買い目一覧/,\n  "本命・押さえ・流し・万舟と重複するAI買い目一覧を表示しない"\n);\n`;

const oldFlowAssertion = `assert.equal(\n  compactFlowRows.length,\n  2,\n  "本命欄とAI買い目一覧の流しを1-23-全へまとめる"\n);\n`;

const newFlowAssertion = `assert.equal(\n  compactFlowRows.length,\n  1,\n  "本命欄の流しだけを1-23-全へまとめて表示する"\n);\n`;

if (!source.includes(oldReasonAssertion)) {
  throw new Error("更新対象の旧AI買い目一覧理由テストが見つかりません");
}

if (!source.includes(oldFlowAssertion)) {
  throw new Error("更新対象の旧AI買い目一覧流しテストが見つかりません");
}

source = source
  .replace(oldReasonAssertion, newReasonAssertion)
  .replace(oldFlowAssertion, newFlowAssertion);

fs.writeFileSync(testPath, source);
console.log("AI買い目一覧削除後の表示テストへ更新しました");
