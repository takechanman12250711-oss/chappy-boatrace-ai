"use strict";

const assert = require("node:assert/strict");

global.window = global;
require("../js/ai-core");

const aiCore = global.ChappyAICore;

function entry(
  boatNo,
  {
    course = boatNo,
    exhibitionTime = 6.80 + boatNo * 0.01,
    lapTime = 37.40 + boatNo * 0.02,
    exhibitionSt = 0.14,
    avgSt = 0.15,
    currentSt = [0.14, 0.15]
  } = {}
) {
  return {
    boatNo,
    racerName: `${boatNo}号艇`,
    course: boatNo,
    exhibitionCourse: course,
    exhibitionTime,
    lapTime,
    exhibitionSt,
    avgSt,
    currentSeries: { st: currentSt }
  };
}

function analysis(boatNo, raceFlow = 70) {
  return {
    boatNo,
    playerName: `${boatNo}号艇`,
    indexes: {
      raceFlow,
      st: 65,
      exhibition: 65
    },
    roleScores: {
      attack: 65,
      flow: 65,
      hold: 65,
      pickup: 65,
      road: 65
    }
  };
}

const entries = [
  entry(1),
  entry(2, { exhibitionSt: 0.18 }),
  entry(3, {
    course: 4,
    exhibitionTime: 6.69,
    lapTime: 37.20,
    exhibitionSt: 0.05,
    avgSt: 0.14
  }),
  entry(4, {
    course: 3,
    exhibitionTime: 6.74,
    lapTime: 37.28,
    exhibitionSt: 0.13,
    avgSt: 0.15
  }),
  entry(5),
  entry(6)
];

const analyses = [
  analysis(1, 78),
  analysis(2, 74),
  analysis(3, 88),
  analysis(4, 72),
  analysis(5, 80),
  analysis(6, 76)
];

const theory = aiCore.buildAttackTheory(entries, analyses, {
  stadiumCode: "12"
});

assert.equal(theory.source, "ai-core-attack-theory-v1");
assert.equal(theory.isFormal, true);
assert.equal(theory.ranking.length, 2, "攻め候補は3・4コースだけ");

const boat3 = theory.roles.find((boat) => boat.boatNo === 3);
const boat4 = theory.roles.find((boat) => boat.boatNo === 4);
const boat1 = theory.roles.find((boat) => boat.boatNo === 1);
const boat5 = theory.roles.find((boat) => boat.boatNo === 5);

assert.equal(boat3.course, 4, "展示進入コースを枠番より優先");
assert.equal(boat4.course, 3, "展示進入の入れ替わりを反映");
assert.equal(boat1.role, "逃げ");
assert.equal(boat5.role, "拾い");
assert.equal(boat1.isAttackCourse, false);
assert.equal(boat5.isAttackCourse, false);
assert.equal(
  Object.values(boat3.components).reduce((sum, value) => sum + value, 0),
  boat3.score,
  "5項目の配点合計と成立点を一致させる"
);
assert.ok(boat3.score >= 65);
assert.equal(boat3.hasStartEvidence, true);
assert.equal(boat3.isAdopted, true);
assert.ok(["S", "A", "B"].includes(boat3.grade));

const theoryByBoat = new Map(
  theory.roles.map((boat) => [boat.boatNo, boat])
);
const scenarios = aiCore.buildRaceScenarios(
  analyses.map((boat) => ({
    ...boat,
    attackTheory: theoryByBoat.get(boat.boatNo)
  })),
  { stadiumCode: "12", entries }
);
const fourAttack = scenarios.scenarios.find(
  (scenario) => scenario.type === "fourAttack"
);
assert.equal(
  fourAttack.attackTheory.boatNo,
  3,
  "4コース攻めは枠番ではなく展示進入4コース艇と接続"
);
assert.equal(fourAttack.attackTheoryAligned, true);

const provisionalEntries = entries.map((boat) => ({
  ...boat,
  exhibitionTime:
    boat.boatNo === 6 ? null : boat.exhibitionTime
}));
const provisional = aiCore.buildAttackTheory(
  provisionalEntries,
  analyses,
  { stadiumCode: "12" }
);
assert.equal(provisional.isFormal, false);
assert.equal(
  provisional.ranking.every((boat) => boat.status === "暫定"),
  true
);
assert.deepEqual(provisional.adoptedBoats, []);

const unsupportedEntries = entries.map((boat) =>
  boat.boatNo === 4
    ? {
        ...boat,
        avgSt: null,
        exhibitionSt: 0.22,
        currentSeries: { st: [] }
      }
    : boat
);
const unsupported = aiCore.buildAttackTheory(
  unsupportedEntries,
  analyses,
  { stadiumCode: "12" }
);
const unsupportedBoat4 = unsupported.roles.find(
  (boat) => boat.boatNo === 4
);
assert.equal(unsupportedBoat4.hasStartEvidence, false);
assert.equal(unsupportedBoat4.isAdopted, false);

console.log("攻め艇理論専用テスト: 合格");
console.log("- 展示進入コースを優先");
console.log("- 1逃げ・2差し・3/4攻め・5/6拾いへ分離");
console.log("- 100点満点の5項目配点とS〜D評価");
console.log("- 展示前は暫定、65点以上＋ST裏付けで正式採用");
