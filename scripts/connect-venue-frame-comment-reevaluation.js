// scripts/connect-venue-frame-comment-reevaluation.js
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const file = path.join(process.cwd(), "index.html");
const scriptTag = '  <script src="js/venue-frame-comment-reevaluation.js?v=20260725-1"></script>';
const anchor = '  <script src="js/venue-frame-comment-audit.js?v=20260725-1"></script>';

let html = fs.readFileSync(file, "utf8");
if (html.includes(scriptTag.trim())) {
  console.log("venue frame comment reevaluation is already connected");
  process.exit(0);
}
if (!html.includes(anchor)) {
  throw new Error("venue frame comment audit script tag was not found");
}
html = html.replace(anchor, `${anchor}\n${scriptTag}`);
fs.writeFileSync(file, html, "utf8");
console.log("connected venue frame comment reevaluation");
