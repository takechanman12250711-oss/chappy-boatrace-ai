"use strict";

// 非表示の旧互換DOM・描画処理・検証表の列ずれをまとめて修正する。
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

let index = read("index.html");
index = replaceRequired(
  index,
  /\n\s*<!-- 旧機能との互換性維持用。画面には表示しない -->\n\s*<div id="missingArea" hidden><\/div>\n\s*<div id="historyArea" hidden><\/div>/,
  "",
  "非表示の旧互換DOM"
);
write("index.html", index);

let stats = read("js/stats.js");
stats = replaceRequired(
  stats,
  /\n\s*U\.setHtml\(\n\s*"historyArea",\n\s*`[\s\S]*?`\n\s*\);/,
  "",
  "historyAreaへの非表示描画処理"
);
stats = replaceRequired(
  stats,
  /<th>実戦厳選<\/th>\n\s*<th>判定<\/th>/,
  "<th>実戦厳選</th>\n               <th>判定</th>\n               <th>8段階の主確認点</th>",
  "検証表の見出し"
);
write("js/stats.js", stats);

let charter = read("scripts/check-charter.js");
const anchor = '  "旧理論CSSまたは一回限りの整理処理が残っています"\n);';
if (!charter.includes(anchor)) {
  throw new Error("憲章検査の追加位置が見つかりません");
}
if (!charter.includes("非表示の旧互換DOMまたは描画処理が残っています")) {
  charter = charter.replace(
    anchor,
    `${anchor}\nassert(\n  !index.includes('id="missingArea"') &&\n    !index.includes('id="historyArea"') &&\n    !read("js/stats.js").includes('"historyArea"'),\n  "非表示の旧互換DOMまたは描画処理が残っています"\n);`
  );
}
write("scripts/check-charter.js", charter);

console.log("非表示の旧互換UIと検証表の列ずれを修正しました");
