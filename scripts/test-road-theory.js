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
  typeof aiCore.buildRoadTheory,
  "function",
  "buildRoadTheoryを公開する"
);

function entry(boatNo, overrides = {}) {
  return {
    boatNo,
    exhibitionCourse: boatNo,
    exhibitionTime: 6.80 + boatNo * 0.02,
    lapTime: 37.0 + boatNo * 0.08,
    currentResults: [2, 3, 2],
    localWinRate: 5.5,
    nationalWinRate: 6.0,
    ...overrides
  };
}

function analysis(boatNo) {
  return {
    boatNo,
    playerName: `${boatNo}号艇`,
    indexes: {
      local: 70,
      national: 75
    },
    roleScores: {
      road: 70
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

const theory = aiCore.buildRoadTheory(
  entries,
  analyses,
  { venue: "住之江", windSpeed: 2, waveHeight: 1 },
  raceScenarios
);

const byBoat = new Map(
  theory.roles.map((boat) => [boat.boatNo, boat])
);

assert.equal(byBoat.get(4).course, 4);
assert.equal(byBoat.get(4).role, "攻め後の粘り");
assert.equal(byBoat.get(1).role, "残し");
assert.equal(byBoat.get(5).role, "拾い");
assert.equal(byBoat.get(3).isBlocked, true);
assert.equal(byBoat.get(3).isAdopted, false);
assert.equal(byBoat.get(1).isFormal, true);
assert.ok(["S", "A", "B"].includes(byBoat.get(1).grade));
assert.ok(
  theory.adoptedBoats.length > 0,
  "65点以上かつゴール想定一致の艇を正式採用する"
);
assert.ok(
  theory.ranking.slice(0, theory.adoptedBoats.length)
    .every((boat) => boat.isAdopted),
  "正式採用艇を表示順の先頭へ置く"
);
assert.deepEqual(
  Object.keys(byBoat.get(1).components),
  [
    "scenarioMatch",
    "lapAndFoot",
    "seriesStability",
    "coursePosition",
    "localWater",
    "playerSkill"
  ]
);
assert.equal(
  Object.prototype.hasOwnProperty.call(byBoat.get(1).components, "motor"),
  false,
  "モーターを道中成立点へ加算しない"
);

const swappedEntries = entries.map((boat) => {
  if (boat.boatNo === 3) {
    return { ...boat, exhibitionCourse: 4 };
  }
  if (boat.boatNo === 4) {
    return { ...boat, exhibitionCourse: 3 };
  }
  return boat;
});
const swapped = aiCore.buildRoadTheory(
  swappedEntries,
  analyses,
  { venue: "住之江" },
  raceScenarios
);
const swappedByBoat = new Map(
  swapped.roles.map((boat) => [boat.boatNo, boat])
);
assert.equal(swappedByBoat.get(3).course, 4);
assert.equal(swappedByBoat.get(4).course, 3);

const missingEntries = entries.map((boat) =>
  boat.boatNo === 1
    ? { ...boat, lapTime: null, currentResults: [] }
    : boat
);
const provisional = aiCore.buildRoadTheory(
  missingEntries,
  analyses,
  { venue: "住之江" },
  raceScenarios
);
const provisionalBoat = provisional.roles.find(
  (boat) => boat.boatNo === 1
);
assert.equal(provisionalBoat.hasRoadEvidence, false);
assert.equal(provisionalBoat.isFormal, false);
assert.equal(provisionalBoat.isAdopted, false);
assert.equal(provisionalBoat.status, "暫定");

const offScenario = theory.roles.find((boat) => boat.boatNo === 3);
assert.equal(offScenario.isGoalCandidate, false);
assert.equal(offScenario.isAdopted, false);

console.log("道中艇理論テスト: OK");
