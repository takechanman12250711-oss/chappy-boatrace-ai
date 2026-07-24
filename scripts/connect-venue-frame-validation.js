// scripts/connect-venue-frame-validation.js
// index.html に場別枠傾向検証を重複なく接続する。
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const file = path.join(process.cwd(), "index.html");
const marker = '<script src="js/venue-frame-validation.js?v=20260725-1"></script>';
const anchor = '<script src="js/venue-frame-highlights.js?v=20260725-1"></script>';

const html = fs.readFileSync(file, "utf8");
if (html.includes(marker)) {
  console.log("venue-frame-validation は接続済みです");
  process.exit(0);
}
if (!html.includes(anchor)) {
  throw new Error("接続位置 venue-frame-highlights.js が見つかりません");
}
const next = html.replace(anchor, `${anchor}\n  ${marker}`);
fs.writeFileSync(file, next, "utf8");
console.log("venue-frame-validation を index.html に接続しました");
