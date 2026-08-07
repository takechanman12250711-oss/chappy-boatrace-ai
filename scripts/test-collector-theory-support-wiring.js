"use strict";
const fs = require("node:fs");
const path = require("node:path");

const file = path.resolve(__dirname, "../js/prediction-simple-evaluation.js");
const source = fs.readFileSync(file, "utf8");
const modules = [
  "prediction-flow-priority",
  "prediction-st-exhibition-support",
  "prediction-venue-water-support",
  "prediction-skill-local-support",
  "prediction-motor-engine-support",
  "prediction-engine-integration"
];

let previous = -1;
for (const name of modules) {
  const index = source.indexOf(`./${name}`);
  if (index < 0) throw new Error(`${name} がNode履歴収集へ接続されていません`);
  if (index <= previous) throw new Error(`${name} の接続順が本番runtimeと一致していません`);
  previous = index;
}
if (!source.includes('typeof module !== "undefined"') || !source.includes('typeof require === "function"')) {
  throw new Error("ブラウザへNode専用requireを漏らさない安全条件がありません");
}
console.log("collector theory support wiring tests passed");
