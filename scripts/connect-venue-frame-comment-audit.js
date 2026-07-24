// scripts/connect-venue-frame-comment-audit.js
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const file = path.join(process.cwd(), "index.html");
const script = '  <script src="js/venue-frame-comment-audit.js?v=20260725-1"></script>';
let html = fs.readFileSync(file, "utf8");
if (html.includes("js/venue-frame-comment-audit.js")) {
  console.log("Already connected");
  process.exit(0);
}
const anchors = [
  '  <script src="js/venue-frame-comment-supplement.js?v=20260725-1"></script>',
  '  <script src="js/venue-frame-adoption-candidates.js?v=20260725-1"></script>',
  '  <script src="js/venue-frame-validation.js?v=20260725-1"></script>'
];
const anchor = anchors.find(item => html.includes(item));
if (!anchor) throw new Error("Connection anchor not found");
html = html.replace(anchor, `${anchor}\n${script}`);
fs.writeFileSync(file, html, "utf8");
console.log("Connected venue frame comment audit");
