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
  typeof aiCore.buildLocalTheory,
  "function",
  "buildLocalTheoryを公開する"
);

function entry(boatNo, overrides = {}) {
  return {
    boatNo,
    exhibitionCourse: boatNo,
    localWinRate: 6.4,
    local2Rate: 48,
    local3Rate: 68,
    nationalWinRate: 5.6,
    ...overrides
  };
}

function analysis(boatNo) {
  return {
    boatNo,
    playerName: `${boatNo}号艇`,
    indexes: {
      local: 80,
      national: 75
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
      st: 0.12,
      isOfficialCourse: true,
      mappingSource: "official-start-image"
    }
  }));
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

const theory = aiCore.buildLocalTheory(
  entries,
  analyses,
  {
    venue: "宮島",
    windSpeed: 5,
    waveHeight: 5
  },
  raceScenarios
);

const byBoat = new Map(
  theory.roles.map((boat) => [boat.boatNo, boat])
);

assert.equal(theory.source, "ai-core-local-theory-v1");
assert.equal(byBoat.get(4).course, 4);
assert.equal(byBoat.get(4).role, "攻め");
assert.equal(byBoat.get(1).role, "残し");
assert.equal(byBoat.get(5).role, "拾い");
assert.equal(byBoat.get(3).isBlocked, true);
assert.equal(byBoat.get(3).isAdopted, false);
assert.equal(byBoat.get(1).hasLocalEvidence, true);
assert.equal(byBoat.get(1).isFormal, true);
assert.ok(
  theory.adoptedBoats.length > 0,
  "65点以上かつ展開一致の当地巧者を正式採用する"
);
assert.ok(
  theory.ranking.slice(0, theory.adoptedBoats.length)
    .every((boat) => boat.isAdopted),
  "正式採用艇を表示順の先頭へ置く"
);
assert.deepEqual(
  Object.keys(byBoat.get(1).components),
  [
    "localVsNational",
    "localResults",
    "scenarioRole",
    "venueCourse",
    "venueWater",
    "playerSkill"
  ]
);
assert.equal(
  Math.round(
    Object.values(byBoat.get(1).components)
      .reduce((sum, value) => sum + value, 0) * 10
  ) / 10,
  byBoat.get(1).score,
  "6項目の配点合計と当地適性点を一致させる"
);
assert.equal(
  Object.prototype.hasOwnProperty.call(
    byBoat.get(1).components,
    "motor"
  ),
  false,
  "モーターを当地適性点へ加算しない"
);

const swappedEntries = withOfficialCourseMapping(
  entries,
  { 3: 4, 4: 3 }
);
const swapped = aiCore.buildLocalTheory(
  swappedEntries,
  analyses,
  { venue: "宮島" },
  raceScenarios
);
const swappedByBoat = new Map(
  swapped.roles.map((boat) => [boat.boatNo, boat])
);
assert.equal(swappedByBoat.get(3).course, 4);
assert.equal(swappedByBoat.get(4).course, 3);

const missingEntries = entries.map((boat) =>
  boat.boatNo === 1
    ? {
        ...boat,
        local2Rate: null,
        local3Rate: null
      }
    : boat
);
const provisional = aiCore.buildLocalTheory(
  missingEntries,
  analyses,
  { venue: "宮島" },
  raceScenarios
);
const provisionalBoat = provisional.roles.find(
  (boat) => boat.boatNo === 1
);
assert.equal(provisionalBoat.hasLocalEvidence, false);
assert.equal(provisionalBoat.isFormal, false);
assert.equal(provisionalBoat.isAdopted, false);
assert.equal(provisionalBoat.status, "暫定");

const nationalOnlyEntries = entries.map((boat) =>
  boat.boatNo === 2
    ? {
        ...boat,
        localWinRate: 5.5,
        nationalWinRate: 7.2,
        local2Rate: 32,
        local3Rate: 48
      }
    : boat
);
const nationalOnly = aiCore.buildLocalTheory(
  nationalOnlyEntries,
  analyses,
  { venue: "宮島" },
  raceScenarios
);
const nationalOnlyBoat = nationalOnly.roles.find(
  (boat) => boat.boatNo === 2
);
assert.ok(
  nationalOnlyBoat.components.localVsNational <= 5,
  "全国成績が高いだけの艇を当地比較で押し上げない"
);

console.log("当地巧者理論テスト: OK");
