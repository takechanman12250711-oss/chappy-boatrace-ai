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
  typeof aiCore.buildWallTheory,
  "function",
  "壁艇の共通判定を公開する"
);

function entry(boatNo, overrides = {}) {
  return {
    boatNo,
    exhibitionCourse: boatNo,
    avgSt: 0.15,
    exhibitionSt: 0.11 + boatNo * 0.01,
    exhibitionTime: 6.70 + boatNo * 0.01,
    lapTime: 37.00 + boatNo * 0.02,
    currentSeries: {
      st: [0.13 + boatNo * 0.002, 0.14 + boatNo * 0.002]
    },
    ...overrides
  };
}

function analysis(boatNo, overrides = {}) {
  return {
    boatNo,
    playerName: `${boatNo}号艇`,
    indexes: {
      national: 75,
      local: 75,
      turn: 75,
      ...overrides.indexes
    },
    roleScores: {
      hold: 75,
      road: 75,
      ...overrides.roleScores
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
entries[1] = entry(2, {
  avgSt: 0.13,
  exhibitionSt: 0.08,
  exhibitionTime: 6.60,
  lapTime: 36.80,
  currentSeries: { st: [0.10, 0.11, 0.10] }
});
entries[2] = entry(3, {
  avgSt: 0.15,
  exhibitionSt: 0.12,
  exhibitionTime: 6.72,
  lapTime: 37.06,
  currentSeries: { st: [0.14, 0.15, 0.14] }
});

const analyses = [1, 2, 3, 4, 5, 6].map((boatNo) =>
  analysis(boatNo)
);
const scenario = {
  attacker: 3,
  mainScenario: {
    type: "threeAttack",
    label: "3コース攻め",
    attacker: 3,
    blockedBoats: []
  },
  blockedBoats: []
};
const formal = aiCore.buildWallTheory(
  entries,
  analyses,
  {
    stadiumName: "住之江",
    weather: {
      windSpeed: 4,
      waveHeight: 2
    }
  },
  scenario
);
const formalByBoat = new Map(
  formal.roles.map((boat) => [boat.boatNo, boat])
);

assert.equal(formal.source, "ai-core-wall-theory-v1");
assert.equal(formal.roles.length, 6, "6艇を同一基準で評価する");
assert.equal(formal.attackerNo, 3);
assert.equal(formal.attackerCourse, 3);
assert.equal(formal.wallCourse, 2);
assert.equal(formal.wallCandidateNo, 2);
assert.equal(formal.wallBoat, 2);
assert.equal(formal.state, "壁成立");
assert.equal(formal.scoreAdjustment, -3);
assert.equal(formal.adjustmentApplied, false);
assert.equal(formalByBoat.get(2).isAdjacent, true);
assert.equal(formalByBoat.get(2).isAdopted, true);
assert.deepEqual(
  Object.keys(formalByBoat.get(2).components),
  [
    "startComparison",
    "startStability",
    "courseAdjacency",
    "exhibitionFoot",
    "holdRoad",
    "skillCourse",
    "surfaceAdaptation"
  ]
);
assert.equal(
  Object.values(formalByBoat.get(2).components)
    .reduce((sum, value) => sum + value, 0),
  formalByBoat.get(2).score,
  "7項目の配点合計と壁成立点を一致させる"
);

const collapsedEntries = entries.map((boat) =>
  boat.boatNo === 2
    ? {
        ...boat,
        avgSt: 0.22,
        exhibitionSt: 0.21,
        currentSeries: { st: [0.21, 0.22, 0.21] }
      }
    : boat
);
const collapsed = aiCore.buildWallTheory(
  collapsedEntries,
  analyses,
  { stadiumName: "住之江" },
  scenario
);
assert.equal(collapsed.state, "壁崩れ");
assert.equal(collapsed.wallBoat, null);
assert.equal(collapsed.scoreAdjustment, 3);

const swappedEntries = withOfficialCourseMapping(
  entries,
  { 2: 3, 3: 2 }
);
const swappedScenario = {
  attacker: 2,
  mainScenario: {
    type: "threeAttack",
    label: "展示進入変化",
    attacker: 2,
    blockedBoats: []
  },
  blockedBoats: []
};
const swapped = aiCore.buildWallTheory(
  swappedEntries,
  analyses,
  { stadiumName: "住之江" },
  swappedScenario
);
assert.equal(swapped.attackerCourse, 3);
assert.equal(swapped.wallCourse, 2);
assert.equal(
  swapped.wallCandidateNo,
  3,
  "展示進入で実際に内側へ隣接する艇を壁候補にする"
);

const missingEvidence = entries.map((boat) => ({
  boatNo: boat.boatNo,
  exhibitionCourse: boat.exhibitionCourse
}));
const provisional = aiCore.buildWallTheory(
  missingEvidence,
  analyses,
  { stadiumName: "住之江" },
  scenario
);
assert.equal(provisional.state, "暫定");
assert.equal(provisional.wallBoat, null);
assert.equal(provisional.scoreAdjustment, 0);

const blocked = aiCore.buildWallTheory(
  entries,
  analyses,
  { stadiumName: "住之江" },
  {
    ...scenario,
    mainScenario: {
      ...scenario.mainScenario,
      blockedBoats: [2]
    },
    blockedBoats: [2]
  }
);
assert.equal(blocked.state, "展開除外");
assert.equal(blocked.wallBoat, null);

const escape = aiCore.buildWallTheory(
  entries,
  analyses,
  { stadiumName: "住之江" },
  {
    attacker: 1,
    mainScenario: {
      type: "escape",
      label: "1号艇逃げ",
      attacker: 1,
      blockedBoats: []
    }
  }
);
assert.equal(escape.state, "対象外");
assert.equal(escape.wallBoat, null);

console.log("壁艇理論専用テスト: 合格");
console.log("- 7項目・100点で6艇を共通評価");
console.log("- 展示進入の内側隣接艇だけを壁候補化");
console.log("- 壁成立・互角・壁崩れ・暫定を分離");
console.log("- 新しい壁成立点は既存の±3点へ重ねて加算しない");
