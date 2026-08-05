"use strict";

const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");

const loaderPath = path.join(root, "js", "prediction-runtime-loader.js");
const indexPath = path.join(root, "index.html");

let loader = fs.readFileSync(loaderPath, "utf8");
let index = fs.readFileSync(indexPath, "utf8");

loader = loader.replace(
  /const VERSION = "[^"]+";/,
  'const VERSION = "20260805-direct-render-accordion1";'
);

index = index.replace(
  /style\.css\?v=[^"]+/,
  "style.css?v=20260805-direct-render-accordion1"
);
index = index.replace(
  /js\/app-runtime-loader\.js\?v=[^"]+/,
  "js/app-runtime-loader.js?v=20260805-direct-render-accordion1"
);

fs.writeFileSync(loaderPath, loader);
fs.writeFileSync(indexPath, index);
console.log("direct accordion cache versions applied");
