"use strict";

const assert = require("node:assert/strict");

global.window = global;
require("../js/evaluated-scenario-candidates");
require("../js/ai-core");

const aiCore = global.ChappyAICore;

function raceData(times) {
  return {
    source: "boatrace-official",
    stadiumCode: "12",
    raceNo: 1,
    date: "20260810",
    entries: times.map((displayTime, index) => ({
      boat: index + 1,
      racerName: `${index + 1}号艇`,
      className: "A2",
      avgSt: 0.15,
      nationalWinRate: 5.0,
      localWinRate: 5.0,
      motor2Rate: 33,
      exhibition: { displayTime },
      currentRace: { stList: [0.15, 0.15] }
    })),
    startExhibition: Array.from({ length: 6 }, (_, index) => ({
      boat: index + 1,
      course: index + 1,
      st: 0.15,
      isOfficialCourse: true
    })),
    weather: {
      windSpeed: 2,
      waveHeight: 1,
      windDirection: "向かい風"
    }
  };
}

function byBoat(core, boatNo) {
  return core.analyses.find(row => Number(row.boatNo) === Number(boatNo));
}

const fastInside = aiCore.buildPredictionData(
  raceData([6.68, 6.72, 6.76, 6.80, 6.84, 6.88])
);
const fastOutside = aiCore.buildPredictionData(
  raceData([6.88, 6.84, 6.80, 6.76, 6.72, 6.68])
);

const inside1 = byBoat(fastInside, 1);
const outside1 = byBoat(fastOutside, 1);
const inside6 = byBoat(fastInside, 6);
const outside6 = byBoat(fastOutside, 6);

assert.ok(inside1 && outside1 && inside6 && outside6, "6艇のAIコア解析を生成する");
assert.ok(
  inside1.indexes.exhibition > outside1.indexes.exhibition,
  "1号艇の展示順位を落とすと展示指数も下がる"
);
assert.ok(
  inside1.indexes.total > outside1.indexes.total,
  "展示指数が表示だけでなくAIコア最終totalへ反映される"
);
assert.ok(
  outside6.indexes.exhibition > inside6.indexes.exhibition,
  "6号艇の展示順位を上げると展示指数も上がる"
);
assert.ok(
  outside6.indexes.total > inside6.indexes.total,
  "展示指数の変化が艇の最終評価へ到達する"
);

assert.equal(
  fastInside.exhibitionPerformanceTheory?.isFormal,
  true,
  "6艇の公式展示タイムが揃う場合だけ正式展示評価を使う"
);
assert.equal(
  fastOutside.exhibitionPerformanceTheory?.isFormal,
  true
);

console.log("展示・足のAIコア本体反映テスト: 合格");
console.log("- 展示順位変更 → 展示指数変更 → 最終total変更を確認");
console.log("- 表示用supportではなくbuildPredictionData本体を直接検証");
