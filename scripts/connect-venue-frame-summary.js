// scripts/connect-venue-frame-summary.js
// index.htmlへ場別枠傾向コメントを一度だけ接続する。
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const file = path.join(process.cwd(), "index.html");
const scriptTag = '  <script src="js/venue-frame-summary.js?v=20260725-1"></script>';
const anchor = '  <script src="js/venue-frame-highlights.js?v=20260725-1"></script>';

const html = fs.readFileSync(file, "utf8");
if (html.includes(scriptTag)) {
  console.log("場別枠傾向コメントは接続済みです");
  process.exit(0);
}
if (!html.includes(anchor)) {
  throw new Error("venue-frame-highlights.js の接続位置が見つかりません");
}
fs.writeFileSync(file, html.replace(anchor, `${anchor}\n${scriptTag}`), "utf8");
console.log("場別枠傾向コメントをindex.htmlへ接続しました");
