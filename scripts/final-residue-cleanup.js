"use strict";

// PR同期で最終整理と分割済み全検査を実行する。
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const write = (file, content) => fs.writeFileSync(path.join(root, file), content, "utf8");

function replaceAllRequired(content, from, to, label) {
  if (!content.includes(from)) {
    throw new Error(`${label} が見つかりません`);
  }
  return content.split(from).join(to);
}

let style = read("style.css");
style = replaceAllRequired(style, ".v3-index-grid,\n.v3-theory-grid,\n.v3-newspaper-list,", ".v3-index-grid,\n.v3-newspaper-list,", "旧理論グリッドCSS");
style = replaceAllRequired(style, ".v3-index-cell,\n.v3-theory-item,\n.v3-paper-card,", ".v3-index-cell,\n.v3-paper-card,", "旧理論カードCSS");
style = replaceAllRequired(style, ".v3-info-cell span,\n.v3-index-cell span,\n.v3-theory-label {", ".v3-info-cell span,\n.v3-index-cell span {", "旧理論ラベルCSS");
style = replaceAllRequired(style, ".v3-index-cell,\n.v3-theory-item {\n  padding: 6px;\n}", ".v3-index-cell {\n  padding: 6px;\n}", "旧理論余白CSS");
style = replaceAllRequired(style, ".v3-index-cell strong,\n.v3-theory-main {", ".v3-index-cell strong {", "旧理論メインCSS");
style = replaceAllRequired(
  style,
  "/* 理論・最終コメント */\n\n.v3-theory-main strong {\n  font-size: 13px;\n}\n\n.v3-theory-item p {\n  margin: 4px 0 0;\n  font-size: 10px;\n  color: #4b5563;\n}\n\n.v3-final-grid",
  "/* 最終コメント */\n\n.v3-final-grid",
  "旧理論専用CSS"
);
write("style.css", style);

let charter = read("scripts/check-charter.js");
if (!charter.includes('const style = read("style.css");')) {
  charter = charter.replace(
    'const index = read("index.html");',
    'const index = read("index.html");\nconst style = read("style.css");'
  );
}
const anchor = '  "非表示の旧理論描画処理が残っています"\n);';
if (!charter.includes(anchor)) {
  throw new Error("憲章検査の追加位置が見つかりません");
}
if (!charter.includes("旧理論CSSまたは一回限りの整理処理が残っています")) {
  charter = charter.replace(
    anchor,
    `${anchor}\nassert(\n  !style.includes("v3-theory-") &&\n    !fs.existsSync(path.join(root, ".github/workflows/cleanup-remaining-legacy-ui.yml")) &&\n    !fs.existsSync(path.join(root, "scripts/cleanup-remaining-legacy-ui.js")),\n  "旧理論CSSまたは一回限りの整理処理が残っています"\n);`
  );
}
write("scripts/check-charter.js", charter);

for (const file of [
  ".github/workflows/cleanup-remaining-legacy-ui.yml",
  "scripts/cleanup-remaining-legacy-ui.js"
]) {
  const full = path.join(root, file);
  if (fs.existsSync(full)) fs.rmSync(full);
}

console.log("旧理論CSS・一回限りの整理Workflow・整理Scriptを削除しました");
