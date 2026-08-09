"use strict";

const assert = require("node:assert/strict");
const engine = require("../js/theory-evaluation-engine");
const builder = require("./build-theory-evaluations");

const record = {
  raceKey: "20260806-20-01",
  result: { settled: true, resultTicket: "1-2-4" },
  theoryTagSnapshot: {
    theories: [
      { theoryKey: "race-flow-main", label: "展開理論", tickets: ["1-2-4", "1-3-2"] },
      { theoryKey: "wall-boat", label: "壁艇理論", tickets: ["1-2-4"] },
      { theoryKey: "double-time", label: "ダブルタイム", tickets: ["3-1-4"] }
    ]
  }
};

const result = engine.build(record);
assert.equal(result.catalogSize, 12);
assert.equal(result.uiVisible, false);
assert.equal(result.usableForPrediction, false);
assert.equal(result.automaticApplication, false);
assert.equal(result.evaluations.length, 12);
assert.equal(result.evaluations.find(row => row.theoryKey === "race-flow").matched, true);
assert.equal(result.evaluations.find(row => row.theoryKey === "wall-boat").matched, true);
assert.equal(result.evaluations.find(row => row.theoryKey === "double-time").matched, false);
assert.equal(result.evaluations.find(row => row.theoryKey === "new-engine").status, "not-used");
assert.equal(
  engine.catalogTheoryFor({ theoryKey: "skill", label: "技量理論", sources: ["skill-local-support"] }).key,
  "skill",
  "skill-local-supportを当地・水面理論へ誤分類しない"
);
assert.equal(
  engine.catalogTheoryFor({ theoryKey: "localWater", label: "当地・水面理論", sources: ["venue-water-support"] }).key,
  "local-water"
);
assert.equal(
  engine.catalogTheoryFor({ theoryKey: "newEngine", label: "新エンジン理論", sources: ["motor-engine-support"] }).key,
  "new-engine",
  "正式theoryKeyを広いmotor別名より優先する"
);

const rows = [structuredClone(record)];
assert.equal(builder.evaluateRows(rows), 1);
assert.equal(rows[0].theoryEvaluationSnapshot.catalogSize, 12);
assert.equal(builder.evaluateRows(rows), 0, "同じ評価は二重更新しない");

const pending = engine.build({ result: { settled: false } });
assert.equal(pending.status, "result-unavailable");
assert(pending.evaluations.every(row => row.status === "result-unavailable"));

const missingLocalWaterEvidence = {
  raceKey: "20260808-16-1",
  jcd: "16",
  place: "児島",
  result: { settled: true, resultTicket: "1-2-3" },
  prediction: {
    preRaceConditions: {
      weather: { windSpeed: null, waveHeight: null, tideLevel: null, tidePhase: "" },
      dataAvailability: { wind: false, wave: false, tide: false }
    }
  },
  theoryTagSnapshot: {
    theories: [{ theoryKey: "localWater", label: "当地・水面理論", tickets: ["1-2-3"] }]
  }
};
const invalidLocalWater = engine.build(missingLocalWaterEvidence)
  .evaluations.find(row => row.theoryKey === "local-water");
assert.equal(invalidLocalWater.used, false, "欠損値だけで保存された当地・水面タグを評価へ混ぜない");
assert.equal(invalidLocalWater.status, "not-used");
assert.deepEqual(
  missingLocalWaterEvidence.theoryTagSnapshot.theories,
  [{ theoryKey: "localWater", label: "当地・水面理論", tickets: ["1-2-3"] }],
  "結果後の評価で予想時点の理論タグを改変しない"
);

const measuredLocalWater = structuredClone(missingLocalWaterEvidence);
measuredLocalWater.prediction.preRaceConditions.weather.windSpeed = 0;
measuredLocalWater.prediction.preRaceConditions.dataAvailability.wind = true;
const measuredEvaluation = engine.build(measuredLocalWater)
  .evaluations.find(row => row.theoryKey === "local-water");
assert.equal(measuredEvaluation.status, "evaluated", "実測0mは正式な証拠として評価する");

const venueRuleLocalWater = structuredClone(missingLocalWaterEvidence);
venueRuleLocalWater.jcd = "24";
venueRuleLocalWater.place = "大村";
const venueRuleEvaluation = engine.build(venueRuleLocalWater)
  .evaluations.find(row => row.theoryKey === "local-water");
assert.equal(venueRuleEvaluation.status, "evaluated", "固有水面ルールの証拠は欠損気象でも保持する");

console.log("理論評価エンジン Phase1: 合格");
