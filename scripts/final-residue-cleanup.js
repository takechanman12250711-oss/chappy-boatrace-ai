"use strict";

const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const stylePath = path.join(root, "style.css");
let style = fs.readFileSync(stylePath, "utf8");

const before = style;
style = style.replace(/^\s*\.v3-theory-[^\n{]+,\s*$/gm, "");
style = style.replace(/^\s*\.v3-theory-[^{\n]+\{[\s\S]*?^\}\s*$/gm, "");
style = style.replace(/\n{3,}/g, "\n\n");

if (style === before) {
  throw new Error("削除対象の旧理論CSSが見つかりません");
}
if (style.includes("v3-theory-")) {
  const remaining = style
    .split("\n")
    .map((line, index) => ({ line, no: index + 1 }))
    .filter(item => item.line.includes("v3-theory-"));
  throw new Error(`旧理論CSSが残っています: ${JSON.stringify(remaining)}`);
}

fs.writeFileSync(stylePath, style, "utf8");
console.log("残っていた全ての旧理論CSSセレクタを削除しました");
