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

function analysis(
  boatNo,
  {
    hold = 70,
    pickup = 70
  } = {}
) {
  return {
    boatNo,
    playerName: `${boatNo}号艇`,
    indexes: {
      raceFlow: 70,
      st: 65,
      exhibition: 65
    },
    roleScores: {
      attack: 65,
      flow: 70,
      hold,
      pickup,
      road: 65
    }
  };
}

const entries = [
  entry(1, {
    exhibitionTime: 6.68,
    lapTime: 37.18
  }),
  entry(2),
  entry(3, {
    course: 4,
    exhibitionTime: 6.70,
    lapTime: 37.22,
    exhibitionSt: 0.06
  }),
  entry(4, { course: 3 }),
  entry(5, {
    exhibitionTime: 6.72,
    lapTime: 37.24
  }),
  entry(6)
];

const analyses = [
  analysis(1, { hold: 92, pickup: 74 }),
  analysis(2, { hold: 88, pickup: 70 }),
  analysis(3, { hold: 70, pickup: 70 }),
  analysis(4, { hold: 70, pickup: 70 }),
  analysis(5, { hold: 66, pickup: 94 }),
  analysis(6, { hold: 60, pickup: 60 })
];

const attackTheory = {
  roles: entries.map((boat) => ({
    boatNo: boat.boatNo,
    course: boat.exhibitionCourse
  }))
};

const raceScenarios = {
  mainScenario: {
    type: "fourAttack",
    label: "4カド攻め",
    attacker: 4,
    attackTheory: {
      boatNo: 3,
      course: 4,
      isAdopted: true
    },
    blockedBoats: [2],
    outcome: {
      secondCandidates: [
        { boatNo: 1 },
        { boatNo: 2 }
      ],
      thirdCandidates: [
        { boatNo: 5 }
      ]
    }
  }
};

const theory = aiCore.buildFlowTheory(
  entries,
  analyses,
  { stadiumCode: "12" },
  raceScenarios,
  attackTheory
);

assert.equal(theory.source, "ai-core-flow-theory-v1");
assert.equal(theory.isFormal, true);
assert.equal(theory.attackerBoatNo, 3);
assert.equal(
  theory.ranking.some((boat) => boat.boatNo === 3),
  false,
  "攻め艇自身は展開艇ランキングへ重複登録しない"
);

const boat1 = theory.roles.find((boat) => boat.boatNo === 1);
const boat2 = theory.roles.find((boat) => boat.boatNo === 2);
const boat3 = theory.roles.find((boat) => boat.boatNo === 3);
const boat5 = theory.roles.find((boat) => boat.boatNo === 5);
const boat6 = theory.roles.find((boat) => boat.boatNo === 6);

assert.equal(boat1.role, "残し");
assert.equal(boat5.role, "拾い");
assert.equal(boat3.status, "攻め起点");
assert.equal(boat2.isBlocked, true);
assert.equal(boat2.status, "展開除外");
assert.equal(boat2.isAdopted, false);
assert.equal(boat6.isAdopted, false);
assert.equal(boat1.isAdopted, true);
assert.equal(boat5.isAdopted, true);
assert.ok(["S", "A", "B"].includes(boat1.grade));
assert.equal(
  Object.values(boat1.components).reduce(
    (sum, value) => sum + value,
    0
  ),
  boat1.score,
  "6項目の配点合計と成立点を一致させる"
);

const provisionalEntries = entries.map((boat) => ({
  ...boat,
  exhibitionTime:
    boat.boatNo === 6 ? null : boat.exhibitionTime
}));
const provisional = aiCore.buildFlowTheory(
  provisionalEntries,
  analyses,
  { stadiumCode: "12" },
  raceScenarios,
  attackTheory
);

assert.equal(provisional.isFormal, false);
assert.deepEqual(provisional.adoptedBoats, []);
assert.equal(
  provisional.roles
    .filter((boat) =>
      boat.isSecondCandidate || boat.isThirdCandidate
    )
    .filter((boat) => !boat.isAttackSource)
    .every((boat) =>
      boat.isBlocked || boat.status === "暫定"
    ),
  true
);

console.log("展開艇理論専用テスト: 合格");
console.log("- 最有力展開の2・3着候補だけを正式判定");
console.log("- 攻め艇自身を分離し、飛び候補を除外");
console.log("- 展示進入コースと6項目100点配点を使用");
console.log("- 展示不足時は暫定、65点以上で正式採用");
