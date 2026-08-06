"use strict";

const fs = require("node:fs");
const path = require("node:path");

const renderPath = path.resolve(__dirname, "..", "js", "render.js");
let source = fs.readFileSync(renderPath, "utf8");

source = source.replace(
  "展開を最優先に実戦向けへ厳選。通常は5～7点、独立して成立する展開がある場合のみ最大10点まで追加します。オッズだけでは削除しません。",
  "展開を最優先に実戦向けへ厳選。通常は5～7点、独立して成立する展開がある場合のみ最大10点まで追加します。数字・オッズだけによる削除はしていません。"
);

if (!source.includes("数字・オッズだけによる削除はしていません")) {
  throw new Error("charter wording was not restored");
}

fs.writeFileSync(renderPath, source);
console.log("charter wording restored");
