"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");
const {
  parseOfficialRaceHtml
} = require("../api/_parser");

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
  typeof aiCore.buildMotorMaintenanceTheory,
  "function",
  "モーター・整備気配の共通判定を公開する"
);

const parsedBefore = parseOfficialRaceHtml(
  "",
  "枠 写真 ボートレーサー " +
    "1 山田 太郎 52.0kg 6.71 0.0 リング×2 " +
    "2 佐藤 次郎 52.0kg 6.72 0.0 ピストン×2 " +
    "部品交換凡例"
);
assert.equal(
  parsedBefore.beforeInfo[0].exhibition.partsExchange,
  "リング×2",
  "公式の部品交換情報を1号艇へ取り込む"
);
assert.equal(
  parsedBefore.beforeInfo[1].exhibition.partsExchange,
  "ピストン×2",
  "公式の部品交換情報を2号艇へ取り込む"
);

function entry(boatNo, overrides = {}) {
  return {
    boatNo,
    exhibitionCourse: boatNo,
    exhibitionTime: 6.80 + boatNo * 0.02,
    exhibitionSt: 0.08 + boatNo * 0.01,
    lapTime: 37.20 + boatNo * 0.04,
    currentSeries: {
      st: [0.11 + boatNo * 0.005, 0.13 + boatNo * 0.005]
    },
    currentResults: [2, 3, 2],
    motor2Rate: 30 + boatNo,
    motor3Rate: 44 + boatNo,
    boat2Rate: 70,
    ...overrides
  };
}

function analysis(boatNo) {
  return {
    boatNo,
    playerName: `${boatNo}号艇`,
    indexes: {
      turn: 80,
      national: 80,
      local: 80
    }
  };
}

function withOfficialCourseMapping(
  sourceEntries,
  courseByBoat = {}
) {
  return sourceEntries.map((boat) => ({
    ...boat,
    startExhibition: {
      boat: boat.boatNo,
      course:
        courseByBoat[boat.boatNo] ??
        boat.boatNo,
      st: boat.exhibitionSt,
      isOfficialCourse: true,
      mappingSource: "official-start-image"
    }
  }));
}

const entries = [1, 2, 3, 4, 5, 6].map((boatNo) => entry(boatNo));
entries[3] = entry(4, {
  exhibitionTime: 6.60,
  exhibitionSt: 0.03,
  lapTime: 36.80,
  currentSeries: { st: [0.08, 0.09] },
  currentResults: [1, 1, 2],
  motor2Rate: 48,
  motor3Rate: 62,
  partsExchange: "リング×2",
  maintenanceComparison: {
    before: {
      exhibitionTime: 6.78,
      lapTime: 37.12,
      st: 0.16,
      finish: 4
    },
    after: {
      exhibitionTime: 6.60,
      lapTime: 36.80,
      st: 0.09,
      finish: 2
    }
  }
});

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

const theory = aiCore.buildMotorMaintenanceTheory(
  entries,
  analyses,
  {
    stadiumName: "住之江",
    date: "20260723",
    motorUsageRaces: 24
  },
  raceScenarios
);
const byBoat = new Map(
  theory.roles.map((boat) => [boat.boatNo, boat])
);

assert.equal(theory.source, "ai-core-motor-maintenance-theory-v1");
assert.equal(theory.roles.length, 6, "6艇を同一基準で評価する");
assert.equal(theory.motorStatsReady, true);
assert.equal(byBoat.get(4).course, 4);
assert.equal(byBoat.get(4).role, "攻め");
assert.equal(byBoat.get(1).role, "残し");
assert.equal(byBoat.get(5).role, "拾い");
assert.equal(byBoat.get(3).isBlocked, true);
assert.equal(byBoat.get(3).isAdopted, false);
assert.equal(byBoat.get(4).maintenance.trend, "改善");
assert.equal(byBoat.get(4).components.maintenanceChange, 15);
assert.equal(byBoat.get(4).components.relativeMotor, 10);
assert.ok(
  theory.adoptedBoats.includes(4),
  "65点以上・実走根拠・展開一致の艇を正式採用する"
);
assert.deepEqual(
  Object.keys(byBoat.get(4).components),
  [
    "exhibitionFoot",
    "currentRoad",
    "startAndSlit",
    "maintenanceChange",
    "relativeMotor",
    "scenarioRole",
    "playerAdjustment"
  ]
);
assert.equal(
  Object.values(byBoat.get(4).components)
    .reduce((sum, value) => sum + value, 0),
  byBoat.get(4).score,
  "7項目の配点合計と実戦機力点を一致させる"
);
assert.equal(
  Object.prototype.hasOwnProperty.call(
    byBoat.get(4).components,
    "boatRate"
  ),
  false,
  "ボート成績を実戦機力点へ混在させない"
);

const exchangeOnly = entries.map((boat) =>
  boat.boatNo === 2
    ? {
        ...boat,
        partsExchange: "ピストン×2",
        maintenanceComparison: null
      }
    : boat
);
const exchangeOnlyTheory = aiCore.buildMotorMaintenanceTheory(
  exchangeOnly,
  analyses,
  {
    stadiumName: "住之江",
    motorUsageRaces: 24
  },
  raceScenarios
);
const exchangeOnlyBoat = exchangeOnlyTheory.roles.find(
  (boat) => boat.boatNo === 2
);
assert.equal(exchangeOnlyBoat.maintenance.trend, "交換情報のみ");
assert.equal(
  exchangeOnlyBoat.components.maintenanceChange,
  0,
  "部品交換した事実だけでは加点しない"
);

const unknownTerm = aiCore.buildMotorMaintenanceTheory(
  entries,
  analyses,
  { stadiumName: "住之江", date: "20260723" },
  raceScenarios
);
assert.equal(unknownTerm.motorStatsReady, false);
assert.ok(
  unknownTerm.roles.every(
    (boat) => boat.components.relativeMotor === 0
  ),
  "更新時期・使用節数不明のモーター数字は暫定扱いで非加点"
);

const newEngine = aiCore.buildMotorMaintenanceTheory(
  entries,
  analyses,
  {
    stadiumName: "大村",
    date: "20250601",
    motorUsageRaces: 1
  },
  raceScenarios
);
assert.equal(newEngine.newEnvironmentActive, true);
assert.ok(
  newEngine.roles.every(
    (boat) => boat.components.relativeMotor === 0
  ),
  "新型エンジン初期は2連率・3連率を直接加点しない"
);

const swappedEntries = withOfficialCourseMapping(
  entries,
  { 3: 4, 4: 3 }
);
const swapped = aiCore.buildMotorMaintenanceTheory(
  swappedEntries,
  analyses,
  {
    stadiumName: "住之江",
    motorUsageRaces: 24
  },
  raceScenarios
);
const swappedByBoat = new Map(
  swapped.roles.map((boat) => [boat.boatNo, boat])
);
assert.equal(swappedByBoat.get(3).course, 4);
assert.equal(swappedByBoat.get(4).course, 3);

const missingEvidenceEntries = entries.map((boat) => ({
  ...boat,
  exhibitionTime: null,
  lapTime: null,
  currentResults: [],
  currentSeries: { st: [] },
  maintenanceComparison: null
}));
const provisional = aiCore.buildMotorMaintenanceTheory(
  missingEvidenceEntries,
  analyses,
  {
    stadiumName: "住之江",
    motorUsageRaces: 24
  },
  raceScenarios
);
assert.equal(provisional.isFormal, false);
assert.ok(
  provisional.roles.every((boat) => !boat.isAdopted),
  "展示または今節実績の裏付けがなければ正式採用しない"
);

console.log("モーター・整備気配理論テスト: OK");
