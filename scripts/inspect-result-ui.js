"use strict";
const fs = require("fs");
const source = fs.readFileSync("js/stats.js", "utf8").split(/\r?\n/);
const patterns = [/simulatedStake/, /simulatedReturn/, /simulatedProfit/, /simulatedRecoveryRate/, /回収率/, /仮想/, /シミュレーション/];
const hits = [];
source.forEach((line, index) => {
  if (patterns.some(pattern => pattern.test(line))) {
    const start = Math.max(0, index - 8);
    const end = Math.min(source.length, index + 9);
    hits.push({ line: index + 1, context: source.slice(start, end).map((text, offset) => `${start + offset + 1}: ${text}`).join("\n") });
  }
});
fs.writeFileSync("result-ui-context.json", JSON.stringify({ count: hits.length, hits }, null, 2));
console.log(`found ${hits.length} result UI references`);
