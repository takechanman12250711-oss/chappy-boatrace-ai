// scripts/connect-venue-frame-highlights.js
// index.htmlへ場別枠ハイライト表示を安全に接続する。
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const file = path.join(process.cwd(), "index.html");
const marker = '<script src="js/venue-frame-highlights.js?v=20260725-1"></script>';
const anchor = '<script src="js/venue-frame-reference.js?v=20260725-1"></script>';

const source = fs.readFileSync(file, "utf8");
if (source.includes(marker)) {
  console.log("venue frame highlights already connected");
  process.exit(0);
}
if (!source.includes(anchor)) {
  throw new Error("venue frame reference script anchor not found");
}
const next = source.replace(anchor, `${anchor}\n  ${marker}`);
fs.writeFileSync(file, next, "utf8");
console.log("connected venue frame highlights");
