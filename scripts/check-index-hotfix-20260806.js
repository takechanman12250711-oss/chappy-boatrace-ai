"use strict";
const fs = require("node:fs");
const html = fs.readFileSync("index.html", "utf8");
if (!html.includes('<link rel="stylesheet" href="style.css?v=20260806-venue24-hotfix2" />')) throw new Error("style tag missing");
if (!html.includes('<script src="js/app-runtime-loader.js?v=20260806-venue24-hotfix2"></script>')) throw new Error("app runtime tag missing");
if (html.includes('legacy test marker: style.css?v=20260806-venue24-1"stylesheet"')) throw new Error("broken style comment remains");
if (html.includes('legacy test marker: js/app-runtime-loader.js?v=20260806-venue24-1"js/app-runtime-loader')) throw new Error("broken script comment remains");
console.log("index hotfix ok");
