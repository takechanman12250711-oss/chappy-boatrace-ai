"use strict";

// main側の一時起動ワークフローから、監査・削除・検査を実行する。
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const write = (file, content) => fs.writeFileSync(path.join(root, file), content, "utf8");

function replaceRequired(content, from, to, label) {
  if (!content.includes(from)) {
    throw new Error(`${label} が見つかりません`);
  }
  return content.replace(from, to);
}

let style = read("style.css");
style = replaceRequired(style, ".v3-index-grid,\n.v3-theory-grid,\n.v3-newspaper-list,", ".v3-index-grid,\n.v3-newspaper-list,", "旧理論グリッドCSS");
style = replaceRequired(style, ".v3-index-cell,\n.v3-theory-item,\n.v3-paper-card,", ".v3-index-cell,\n.v3-paper-card,", "旧理論カードCSS");
style = replaceRequired(style, ".v3-info-cell span,\n.v3-index-cell span,\n.v3-theory-label {", ".v3-info-cell span,\n.v3-index-cell span {", "旧理論ラベルCSS");
style = replaceRequired(style, ".v3-index-cell,\n.v3-theory-item {\n  padding: 6px;\n}", ".v3-index-cell {\n  padding: 6px;\n}", "旧理論余白CSS");
style = replaceRequired(style, ".v3-index-cell strong,\n.v3-theory-main {", ".v3-index-cell strong {", "旧理論メインCSS");
style = replaceRequired(
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
  throw new Error("旧理論描画の憲章検査位置が見つかりません");
}
const extra = `${anchor}\nassert(\n  !style.includes("v3-theory-") &&\n    !fs.existsSync(path.join(root, ".github/workflows/cleanup-remaining-legacy-ui.yml")) &&\n    !fs.existsSync(path.join(root, "scripts/cleanup-remaining-legacy-ui.js")),\n  "旧理論CSSまたは一回限りの整理処理が残っています"\n);`;
charter = charter.replace(anchor, extra);
write("scripts/check-charter.js", charter);

fs.rmSync(path.join(root, ".github/workflows/cleanup-remaining-legacy-ui.yml"));
fs.rmSync(path.join(root, "scripts/cleanup-remaining-legacy-ui.js"));

console.log("別視点監査で見つかった旧理論CSSと一回限りの整理処理を削除しました");
