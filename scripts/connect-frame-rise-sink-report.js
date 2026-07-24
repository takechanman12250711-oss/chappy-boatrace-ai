#!/usr/bin/env node
"use strict";
const fs = require("fs");
const file = "index.html";
const source = fs.readFileSync(file, "utf8");
const marker = '  <script src="js/reference-tag-report.js?v=20260725-1"></script>';
const line = '  <script src="js/frame-rise-sink-report.js?v=20260725-1"></script>';
if (source.includes(line)) {
  console.log("already connected");
  process.exit(0);
}
if (!source.includes(marker)) {
  throw new Error("reference tag report marker not found");
}
fs.writeFileSync(file, source.replace(marker, `${marker}\n${line}`), "utf8");
console.log("connected frame rise and sink report");
