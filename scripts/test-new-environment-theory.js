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
  typeof aiCore.getNewEnvironmentPeriod,
  "function",
  "導入期間の共通判定を公開する"
);
assert.equal(
  typeof aiCore.buildNewEnvironmentTheory,
  "function",
  "新環境適応点の共通判定を公開する"
);

function entry(boatNo, overrides = {}) {
  return {
    boatNo,
    exhibitionCourse: boatNo,
    exhibitionTime: 6.70 + boatNo * 0.01,
    exhibitionSt: 0.04 + boatNo * 0.01,
    lapTime: 37.00 + boatNo * 0.03,
    currentSeries: {
      st: [0.10 + boatNo * 0.005, 0.12 + boatNo * 0.005]
    },
    currentResults: boatNo <= 3 ? [1, 2, 3] : [2, 3, 4],
    motor2Rate: 80,
    motor3Rate: 90,
    ...overrides
  };
}

function analysis(boatNo) {
  return {
    boatNo,
    playerName: `${boatNo}号艇`,
    indexes: {
      national: 85,
      local: 75
    }
  };
}

const entries = [1, 2, 3, 4, 5, 6].map((boatNo) => entry(boatNo));
const analyses = [1, 2, 3, 4, 5, 6].map(analysis);
const raceScenarios = {
  mainScenario: {
    type: "fourAttack",
    label: "4カド攻め",
    attacker: 4,
    blockedBoats: [3],
    outcome: {
      firstCandidates: [{ boatNo: 4 }],
      secondCandidates: [{ boatNo: 1 }, { boatNo: 2 }],
      thirdCandidates: [{ boatNo: 5 }, { boatNo: 6 }]
    }
  },
  blockedBoats: [3]
};

const earlyPeriod = aiCore.getNewEnvironmentPeriod({
  stadiumName: "大村",
  date: "20250601"
});
assert.equal(earlyPeriod.deployments[0].type, "engine");
assert.equal(earlyPeriod.deployments[0].phase, "early");
assert.equal(earlyPeriod.isActive, true);

const middlePeriod = aiCore.getNewEnvironmentPeriod({
  stadiumName: "大村",
  date: "20250801"
});
assert.equal(middlePeriod.deployments[0].phase, "middle");
assert.equal(middlePeriod.isActive, true);

const stablePeriod = aiCore.getNewEnvironmentPeriod({
  stadiumName: "大村",
  date: "20260723"
});
assert.equal(stablePeriod.deployments[0].phase, "stable");
assert.equal(stablePeriod.isActive, false);
assert.equal(stablePeriod.isStable, true);

const unknownPeriod = aiCore.getNewEnvironmentPeriod({
  stadiumName: "多摩川",
  date: "20260723"
});
assert.equal(unknownPeriod.deployments[0].phase, "unknown");
assert.equal(unknownPeriod.isProvisional, true);
assert.equal(unknownPeriod.isActive, false);

const fuelPeriod = aiCore.getNewEnvironmentPeriod({
  stadiumName: "宮島",
  date: "20260723",
  newEnvironment: {
    fuel: {
      enabled: true,
      introducedAt: "20260701"
    }
  }
});
const fuel = fuelPeriod.deployments.find((item) => item.type === "fuel");
const engine = fuelPeriod.deployments.find((item) => item.type === "engine");
assert.equal(fuel.phase, "early");
assert.equal(fuel.isActive, true);
assert.equal(engine.enabled, false);

const theory = aiCore.buildNewEnvironmentTheory(
  entries,
  analyses,
  {
    stadiumName: "大村",
    date: "20250601",
    weather: {
      windSpeed: 5,
      waveHeight: 5
    }
  },
  raceScenarios
);
const byBoat = new Map(
  theory.roles.map((boat) => [boat.boatNo, boat])
);

assert.equal(theory.source, "ai-core-new-environment-theory-v1");
assert.equal(theory.roles.length, 6, "6艇を同一基準で評価する");
assert.equal(byBoat.get(4).role, "攻め");
assert.equal(byBoat.get(1).role, "残し");
assert.equal(byBoat.get(5).role, "拾い");
assert.equal(byBoat.get(3).isBlocked, true);
assert.equal(byBoat.get(3).isAdopted, false);
assert.equal(byBoat.get(1).hasAdaptationEvidence, true);
assert.ok(
  theory.adoptedBoats.length > 0,
  "65点以上かつ展開一致の適応艇を正式採用する"
);
assert.ok(
  theory.ranking.slice(0, theory.adoptedBoats.length)
    .every((boat) => boat.isAdopted),
  "正式採用艇を表示順の先頭へ置く"
);
assert.deepEqual(
  Object.keys(byBoat.get(1).components),
  [
    "exhibitionFoot",
    "startAndSlit",
    "currentAndRoad",
    "scenarioRole",
    "playerSkill",
    "localWater"
  ]
);
assert.equal(
  Object.prototype.hasOwnProperty.call(
    byBoat.get(1).components,
    "motor"
  ),
  false,
  "モーター数字を新環境適応点へ加算しない"
);
assert.equal(
  Object.values(byBoat.get(1).components)
    .reduce((sum, value) => sum + value, 0),
  byBoat.get(1).score,
  "6項目の配点合計と適応点を一致させる"
);

const swappedEntries = entries.map((boat) => {
  if (boat.boatNo === 3) return { ...boat, exhibitionCourse: 4 };
  if (boat.boatNo === 4) return { ...boat, exhibitionCourse: 3 };
  return boat;
});
const swapped = aiCore.buildNewEnvironmentTheory(
  swappedEntries,
  analyses,
  {
    stadiumName: "大村",
    date: "20250601"
  },
  raceScenarios
);
const swappedByBoat = new Map(
  swapped.roles.map((boat) => [boat.boatNo, boat])
);
assert.equal(swappedByBoat.get(3).course, 4);
assert.equal(swappedByBoat.get(4).course, 3);

const missingEntries = entries.map((boat) => ({
  ...boat,
  exhibitionTime: null,
  lapTime: null,
  currentSeries: { st: [] },
  currentResults: []
}));
const provisional = aiCore.buildNewEnvironmentTheory(
  missingEntries,
  analyses,
  {
    stadiumName: "大村",
    date: "20250601"
  },
  raceScenarios
);
assert.equal(provisional.isFormal, false);
assert.ok(
  provisional.roles.every((boat) => !boat.isAdopted),
  "展示・今節実績がなければ正式採用しない"
);

const unknownTheory = aiCore.buildNewEnvironmentTheory(
  entries,
  analyses,
  {
    stadiumName: "多摩川",
    date: "20260723"
  },
  raceScenarios
);
assert.equal(unknownTheory.isProvisional, true);
assert.equal(unknownTheory.isFormal, false);
assert.ok(
  unknownTheory.roles.every((boat) => !boat.isAdopted),
  "導入日不明なら艇別点が高くても正式採用しない"
);

console.log("新型エンジン・新燃料理論テスト: OK");
