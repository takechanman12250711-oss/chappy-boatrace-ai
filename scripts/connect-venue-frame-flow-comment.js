// scripts/connect-venue-frame-flow-comment.js
// index.html に検証済み場別枠傾向コメントを接続する。
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const file = path.join(process.cwd(), "index.html");
const scriptTag = '  <script src="js/venue-frame-flow-comment.js?v=20260725-1"></script>';
const anchor = '  <script src="js/venue-frame-adoption-candidates.js?v=20260725-1"></script>';

if (!fs.existsSync(file)) throw new Error("index.html が見つかりません");
let html = fs.readFileSync(file, "utf8");

if (html.includes('js/venue-frame-flow-comment.js')) {
  console.log("venue-frame-flow-comment.js は接続済みです");
  process.exit(0);
}

if (html.includes(anchor)) {
  html = html.replace(anchor, `${anchor}\n${scriptTag}`);
} else {
  const fallback = '  <script src="js/script.js';
  const index = html.indexOf(fallback);
  if (index < 0) throw new Error("接続位置が見つかりません");
  html = html.slice(0, index) + scriptTag + "\n" + html.slice(index);
}

fs.writeFileSync(file, html, "utf8");
console.log("venue-frame-flow-comment.js を index.html に接続しました");
