// scripts/connect-venue-frame-adoption-candidates.js
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const file = path.join(process.cwd(), "index.html");
const script = '  <script src="js/venue-frame-adoption-candidates.js?v=20260725-1"></script>';
let html = fs.readFileSync(file, "utf8");
if (html.includes("js/venue-frame-adoption-candidates.js")) process.exit(0);
const anchor = '  <script src="js/venue-frame-validation-quality-gate.js?v=20260725-1"></script>';
if (!html.includes(anchor)) throw new Error("接続基準のquality gate scriptが見つかりません");
html = html.replace(anchor, `${anchor}\n${script}`);
fs.writeFileSync(file, html, "utf8");
console.log("venue-frame-adoption-candidates.js を index.html に接続しました");
