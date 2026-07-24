// scripts/connect-venue-frame-quality-gate.js
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const file = path.join(process.cwd(), "index.html");
let html = fs.readFileSync(file, "utf8");
const tag = '  <script src="js/venue-frame-quality-gate.js?v=20260725-1"></script>';

if (!html.includes(tag)) {
  const anchor = '  <script src="js/venue-frame-validation.js?v=20260725-1"></script>';
  if (!html.includes(anchor)) throw new Error("venue frame validation script tag not found");
  html = html.replace(anchor, `${anchor}\n${tag}`);
  fs.writeFileSync(file, html, "utf8");
  console.log("Connected venue frame quality gate");
} else {
  console.log("Venue frame quality gate already connected");
}
