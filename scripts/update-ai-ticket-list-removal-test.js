"use strict";

const fs = require("node:fs");
const path = require("node:path");

const testPath = path.resolve(__dirname, "test-prediction-transparency-ui.js");
let source = fs.readFileSync(testPath, "utf8");

const oldAssertion = `assert.match(\n  html,\n  /【ランキング固有理由末尾】/,\n  "ランキング行は順位データの固有理由を優先して全文表示する"\n);\n`;

const newAssertion = `assert.doesNotMatch(\n  html,\n  /AI買い目一覧/,\n  "本命・押さえ・流し・万舟と重複するAI買い目一覧を表示しない"\n);\n`;

if (!source.includes(oldAssertion)) {
  throw new Error("更新対象の旧AI買い目一覧テストが見つかりません");
}

source = source.replace(oldAssertion, newAssertion);
fs.writeFileSync(testPath, source);
console.log("AI買い目一覧削除後の表示テストへ更新しました");
