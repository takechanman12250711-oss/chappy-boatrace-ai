"use strict";
const assert = require("node:assert/strict");
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

global.window = global;
global.addEventListener = () => {};
global.document = { addEventListener() {} };
global.createPrediction = () => ({ flowPriority: { attackBoatNo: 3 } });
require("../js/prediction-st-exhibition-support");

const officialPreparedEntries = [
  { boatNo: 1, avgSt: 0.16, averageSt: 0.16, exhibitionSt: 0.15, currentSeries: { st: [0.15, 0.16] } },
  { boatNo: 2, avgSt: 0.18, averageSt: 0.18, exhibitionSt: 0.14, currentSeries: { st: [0.17, 0.18] } },
  { boatNo: 3, avgSt: 0.14, averageSt: 0.14, exhibitionSt: 0.13, currentSeries: { st: [0.09, 0.11] } },
  { boatNo: 4, avgSt: 0.17, averageSt: 0.17, exhibitionSt: 0.12, currentSeries: { st: [0.16, 0.17] } },
  { boatNo: 5, avgSt: 0.19, averageSt: 0.19, exhibitionSt: 0.11, currentSeries: { st: [0.18, 0.19] } },
  { boatNo: 6, avgSt: 0.20, averageSt: 0.20, exhibitionSt: 0.10, currentSeries: { st: [0.19, 0.20] } }
];
const prediction = global.ChappyPredictionSTExhibitionSupport.enhance(
  { flowPriority: { attackBoatNo: 3 } },
  { entries: officialPreparedEntries }
);

assert.equal(prediction.flowSupport.dataCoverage.st, 6, "公式収集のlower-camel ST項目を6艇分読む");
assert.equal(prediction.flowSupport.attackSTRank, 1, "今節ST平均を優先して攻め艇順位を作る");
assert.match(prediction.flowSupport.confirms.join(" "), /スリット上位/);

const theorySnapshot = require("../js/theory-tag-snapshot").build(
  prediction,
  [{ ticket: "3-1-2", category: "本線" }]
);
const startTheory = theorySnapshot.theories.find(row => row.theoryKey === "stSlit");
assert.ok(startTheory, "公式収集入力からST・スリットの正式証拠を保存する");
assert.deepEqual(startTheory.tickets, ["3-1-2"]);
assert.equal(
  theorySnapshot.evidenceDiagnostics.rows.find(row => row.theoryKey === "start")?.formal,
  true
);

console.log("collector theory support wiring tests passed");
