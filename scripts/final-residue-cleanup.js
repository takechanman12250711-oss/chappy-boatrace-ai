"use strict";

const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const stylePath = path.join(root, "style.css");
let style = fs.readFileSync(stylePath, "utf8");

const before = style;
style = style.replace(
  ".v3-index-cell,\n.v3-theory-item,\n.v3-final-block {",
  ".v3-index-cell,\n.v3-final-block {"
);

if (style === before) {
  throw new Error("レスポンシブ用の旧理論カードCSSが見つかりません");
}
if (style.includes("v3-theory-")) {
  throw new Error("ほかの旧理論CSSがまだ残っています");
}

fs.writeFileSync(stylePath, style, "utf8");
console.log("レスポンシブ用に残っていた最後の旧理論CSSを削除しました");
