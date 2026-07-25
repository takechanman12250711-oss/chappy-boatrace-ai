// scripts/connect-venue-frame-operations-dashboard.js
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const indexPath = path.join(process.cwd(), "index.html");
const tag = '  <script src="js/venue-frame-operations-dashboard.js?v=20260725-1"></script>';
const anchor = '  <script src="js/venue-frame-status-history.js?v=20260725-1"></script>';

let html = fs.readFileSync(indexPath, "utf8");
if (html.includes(tag)) {
  console.log("venue frame operations dashboard already connected");
  process.exit(0);
}

if (html.includes(anchor)) {
  html = html.replace(anchor, `${anchor}\n${tag}`);
} else {
  const fallback = '  <script src="js/script.js';
  const index = html.indexOf(fallback);
  if (index < 0) throw new Error("script insertion point not found");
  html = `${html.slice(0, index)}${tag}\n${html.slice(index)}`;
}

fs.writeFileSync(indexPath, html, "utf8");
console.log("connected venue frame operations dashboard");
