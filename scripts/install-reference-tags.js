// scripts/install-reference-tags.js
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const indexPath = path.join(process.cwd(), "index.html");
const source = fs.readFileSync(indexPath, "utf8");
const marker = '  <script src="./js/render.js?v=20260724-integration1"></script>';
const installBlock = `${marker}\n  <script src="js/reference-tags.js?v=20260724-1"></script>\n  <script>window.ChappyReferenceTags?.install();</script>`;

if (source.includes('src="js/reference-tags.js')) {
  console.log("参考情報タグは接続済みです");
  process.exit(0);
}

if (!source.includes(marker)) {
  throw new Error("render.jsの読み込み位置を確認できません");
}

fs.writeFileSync(
  indexPath,
  source.replace(marker, installBlock),
  "utf8"
);

console.log("参考情報タグをindex.htmlへ接続しました");
