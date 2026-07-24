"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function write(file, content) {
  fs.writeFileSync(path.join(root, file), content, "utf8");
}

function replaceRequired(content, pattern, replacement, label) {
  if (!pattern.test(content)) {
    throw new Error(`${label} が見つかりません`);
  }
  pattern.lastIndex = 0;
  return content.replace(pattern, replacement);
}

let render = read("js/render.js");

render = replaceRequired(
  render,
  /\n\s*const THEORY_LABELS = \{[\s\S]*?\n\s*\};\n(?=\s*\/\* ===============================\n\s*DOM)/,
  "\n",
  "旧理論ラベル定義"
);

render = replaceRequired(
  render,
  /\n\s*\/\* ===============================\n\s*7\. 理論分析（旧互換・非表示）\n\s*=============================== \*\/[\s\S]*?(?=\n\s*\/\* ===============================\n\s*8\. 最終コメント)/,
  "\n",
  "旧理論分析描画ブロック"
);

write("js/render.js", render);

let charter = read("scripts/check-charter.js");
const anchor = 'assert(\n  !script.includes("todayMainPick") &&\n    !render.includes("renderTodayAiSummary"),\n  "削除済みの「今日のAIおすすめ」処理が残っています"\n);';

if (!charter.includes(anchor)) {
  throw new Error("憲章検査の旧UI確認位置が見つかりません");
}

const added = `${anchor}\nassert(\n  !render.includes("THEORY_LABELS") &&\n    !render.includes("renderTheoryPanel") &&\n    !render.includes("pushTheoryFromRanking") &&\n    !render.includes("pushTheoryText") &&\n    !render.includes("renderTheoryItem") &&\n    !render.includes("旧互換・非表示"),\n  "非表示の旧理論描画処理が残っています"\n);`;

charter = charter.replace(anchor, added);
write("scripts/check-charter.js", charter);

console.log("残っていた旧理論描画処理を削除しました");
