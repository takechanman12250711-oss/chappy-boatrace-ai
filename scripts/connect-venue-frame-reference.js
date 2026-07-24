// scripts/connect-venue-frame-reference.js
// index.htmlへ場別枠参考パネルを重複なく接続する。
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const file = path.join(process.cwd(), "index.html");
const marker = '  <script src="js/frame-rise-sink-report.js?v=20260725-1"></script>';
const script = '  <script src="js/venue-frame-reference.js?v=20260725-1"></script>';

let html = fs.readFileSync(file, "utf8");
if (html.includes(script)) {
  console.log("場別枠参考パネルは接続済みです");
  process.exit(0);
}
if (!html.includes(marker)) {
  throw new Error("接続位置を見つけられません");
}
html = html.replace(marker, `${marker}\n${script}`);
fs.writeFileSync(file, html, "utf8");
console.log("場別枠参考パネルを接続しました");
