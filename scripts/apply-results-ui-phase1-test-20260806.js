"use strict";

const fs = require("node:fs");
const path = require("node:path");

const testPath = path.resolve(__dirname, "test-load-performance.js");
let source = fs.readFileSync(testPath, "utf8");

source = source.replace(
  `(statsUi.match(/renderMetricCard\\(\\{/g) || []).length,\n  3,\n  "結果画面の指標は3項目に絞る"`,
  `(statsUi.match(/renderMetricCard\\(\\{/g) || []).length,\n  5,\n  "結果画面の主要指標は5項目で表示する"`
);

if (!source.includes("結果画面の主要指標は5項目で表示する")) {
  throw new Error("results UI test expectation was not updated");
}

fs.writeFileSync(testPath, source);
console.log("results UI phase1 test updated");
