"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const source = fs.readFileSync(
  path.join(__dirname, "..", "js", "ai-core.js"),
  "utf8"
);

const sandbox = {
  window: {},
  console,
  setTimeout,
  clearTimeout
};

vm.createContext(sandbox);
vm.runInContext(source, sandbox);

const aiCore = sandbox.window.ChappyAICore;
assert.ok(aiCore, "ChappyAICoreを読み込めない");
assert.equal(
  typeof aiCore.buildWaterWeatherTheory,
  "function",
  "水面・気象適応の共通判定を公開する"
);

function entry(boatNo, overrides = {}) {
  return {
    boatNo,
    exhibitionCourse: boatNo,
    exhibitionTime: 6.70 + boatNo * 0.01,
    lapTime: 37.00 + boatNo * 0.03,
    ...overrides
  };
}

function analysis(boatNo) {
  return {
    boatNo,
    playerName: `${boatNo}号艇`,
    indexes: {
      st: 80,
      local: 80,
      national: 80,
      turn: 80
    }
  };
}

const entries = [1, 2, 3, 4, 5, 6].map((boatNo) => entry(boatNo));
const analyses = [1, 2, 3, 4, 5, 6].map(analysis);
const raceScenarios = {
  mainScenario: {
    type: "fourAttack",
    label: "4カド攻め",
    blockedBoats: [3],
    outcome: {
      firstCandidates: [{ boatNo: 4 }],
      secondCandidates: [{ boatNo: 1 }, { boatNo: 2 }],
      thirdCandidates: [{ boatNo: 5 }, { boatNo: 6 }]
    }
  },
  blockedBoats: [3]
};

const complete = aiCore.buildWaterWeatherTheory(
  entries,
  analyses,
  {
    stadiumName: "大村",
    weather: {
      windDirection: "向かい風",
      windSpeed: 5,
      waveHeight: 5,
      tideLevel: 120,
      tideFlow: "上げ潮"
    }
  },
  raceScenarios
);
const byBoat = new Map(
  complete.roles.map((boat) => [boat.boatNo, boat])
);

assert.equal(complete.source, "ai-core-water-weather-theory-v1");
assert.equal(complete.roles.length, 6, "6艇を同一基準で評価する");
assert.equal(complete.wind.type, "head");
assert.equal(complete.surface.waterType, "海水");
assert.equal(complete.surface.hasLiveTide, true);
assert.equal(complete.isProvisional, false);
assert.equal(byBoat.get(4).role, "攻め");
assert.equal(byBoat.get(1).role, "残し");
assert.equal(byBoat.get(5).role, "拾い");
assert.equal(byBoat.get(3).isBlocked, true);
assert.equal(byBoat.get(3).isAdopted, false);
assert.ok(
  complete.adoptedBoats.includes(4),
  "65点以上かつ最有力展開一致の艇を正式採用する"
);
assert.deepEqual(
  Object.keys(byBoat.get(4).components),
  [
    "windCourse",
    "waveExhibition",
    "surfaceTide",
    "scenarioRole",
    "localRoad",
    "stSkill"
  ]
);
assert.equal(
  Object.values(byBoat.get(4).components)
    .reduce((sum, value) => sum + value, 0),
  byBoat.get(4).score,
  "6項目の配点合計と水面適応点を一致させる"
);

const swappedEntries = entries.map((boat) => {
  if (boat.boatNo === 3) return { ...boat, exhibitionCourse: 4 };
  if (boat.boatNo === 4) return { ...boat, exhibitionCourse: 3 };
  return boat;
});
const swapped = aiCore.buildWaterWeatherTheory(
  swappedEntries,
  analyses,
  {
    stadiumName: "大村",
    weather: {
      windDirection: "向かい風",
      windSpeed: 5,
      waveHeight: 5,
      tideFlow: "下げ潮"
    }
  },
  raceScenarios
);
const swappedByBoat = new Map(
  swapped.roles.map((boat) => [boat.boatNo, boat])
);
assert.equal(swappedByBoat.get(3).course, 4);
assert.equal(swappedByBoat.get(4).course, 3);

const unknownDirection = aiCore.buildWaterWeatherTheory(
  entries,
  analyses,
  {
    stadiumName: "大村",
    weather: {
      windDirection: "北西",
      windSpeed: 5,
      waveHeight: 4,
      tideFlow: "上げ潮"
    }
  },
  raceScenarios
);
assert.equal(unknownDirection.isProvisional, true);
assert.ok(
  unknownDirection.roles.every((boat) => !boat.isAdopted),
  "正確に分類できない風向は正式採用しない"
);

const missingTide = aiCore.buildWaterWeatherTheory(
  entries,
  analyses,
  {
    stadiumName: "大村",
    weather: {
      windDirection: "追い風",
      windSpeed: 4,
      waveHeight: 3
    }
  },
  raceScenarios
);
assert.equal(missingTide.surface.isTidal, true);
assert.equal(missingTide.isProvisional, true);
assert.ok(
  missingTide.roles.every((boat) => !boat.isAdopted),
  "潮汐場で現在潮位・潮流がなければ正式採用しない"
);

const freshwater = aiCore.buildWaterWeatherTheory(
  entries,
  analyses,
  {
    stadiumName: "住之江",
    weather: {
      windDirection: "横風",
      windSpeed: 4,
      waveHeight: 2
    }
  },
  raceScenarios
);
assert.equal(freshwater.surface.isTidal, false);
assert.equal(freshwater.isProvisional, false);

const missingExhibition = aiCore.buildWaterWeatherTheory(
  entries.map((boat) => ({
    ...boat,
    exhibitionTime: null,
    lapTime: null
  })),
  analyses,
  {
    stadiumName: "大村",
    weather: {
      windDirection: "向かい風",
      windSpeed: 5,
      waveHeight: 5,
      tideLevel: 100
    }
  },
  raceScenarios
);
assert.equal(missingExhibition.isFormal, false);
assert.ok(
  missingExhibition.roles.every((boat) => !boat.isAdopted),
  "展示・一周・回り足の裏付けがなければ正式採用しない"
);

console.log("水面・気象適応理論テスト: OK");
