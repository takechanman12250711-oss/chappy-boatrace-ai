"use strict";

const fs = require("node:fs");
const path = require("node:path");
const analyzer = require("../js/miss-cause-analysis");

const root = path.resolve(__dirname, "..");
const predictionsDir = path.join(root, "data", "predictions");

function evaluateRows(rows) {
  let changed = 0;
  (Array.isArray(rows) ? rows : []).forEach(record => {
    if (record?.result?.settled !== true) return;
    const next = analyzer.build(record);
    if (JSON.stringify(record?.result?.missCauseAnalysis || null) === JSON.stringify(next)) return;
    record.result.missCauseAnalysis = next;
    changed += 1;
  });
  return changed;
}

function processFile(file) {
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const changed = evaluateRows(data.predictions) + evaluateRows(data.verificationPredictions);
  if (changed) fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
  return changed;
}

function main() {
  if (!fs.existsSync(predictionsDir)) {
    console.log("外れ原因分析対象なし：predictionsディレクトリなし");
    return;
  }
  let files = 0;
  let races = 0;
  fs.readdirSync(predictionsDir)
    .filter(name => /^\d{8}\.json$/.test(name))
    .sort()
    .forEach(name => {
      const changed = processFile(path.join(predictionsDir, name));
      if (changed) files += 1;
      races += changed;
    });
  console.log(`外れ原因分析保存：${races}R／${files}ファイル`);
}

if (require.main === module) main();
module.exports = { evaluateRows, processFile };
