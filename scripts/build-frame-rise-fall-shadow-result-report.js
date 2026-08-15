"use strict";

const fs = require("node:fs");
const path = require("node:path");
const engine = require("../js/frame-rise-fall-shadow-result-report");

const root = path.resolve(__dirname, "..");
const predictionDir = path.join(root, "data", "predictions");
const resultDir = path.join(root, "data", "results");
const output = path.join(root, "data", "stats", "frame-rise-fall-shadow-result-report.json");

function loadDocuments(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory)
    .filter(name => /^\d{8}\.json$/.test(name))
    .sort()
    .map(name => JSON.parse(fs.readFileSync(path.join(directory, name), "utf8")));
}

function main() {
  const report = engine.build(loadDocuments(predictionDir), loadDocuments(resultDir));
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(
    `枠別浮沈Shadow結果: 比較候補${report.observation.eligibleComparableCount}R` +
    `／公式結果照合${report.observation.settledComparableCount}/100R` +
    `／status=${report.status}`
  );
}

if (require.main === module) main();
module.exports = { loadDocuments, main };
