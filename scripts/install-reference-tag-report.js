#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const file = path.resolve(process.cwd(), "index.html");
const marker = '  <script src="js/reference-tags.js?v=20260724-1"></script>\n  <script>window.ChappyReferenceTags?.install();</script>';
const insertion = `${marker}\n  <script src="js/reference-tag-report.js?v=20260725-1"></script>`;

if (!fs.existsSync(file)) {
  throw new Error("index.html が見つかりません");
}

const source = fs.readFileSync(file, "utf8");

if (source.includes('js/reference-tag-report.js')) {
  console.log("reference tag report is already connected");
  process.exit(0);
}

if (!source.includes(marker)) {
  throw new Error("reference-tags.js の接続位置が見つかりません");
}

fs.writeFileSync(file, source.replace(marker, insertion), "utf8");
console.log("connected js/reference-tag-report.js");
