"use strict";

const assert = require("node:assert/strict");

global.window = global;
require("../js/ai-core");

const aiCore = global.ChappyAICore;

function boat(
  boatNo,
  {
    total = 65,
    st = 60,
    exhibition = 60,
    raceFlow = 65,
    local = 60,
    attack = 60,
    flow = 60,
    hold = 60,
    pickup = 60,
    road = 60
  } = {}
) {
  return {
    boatNo,
    playerName: `${boatNo}号艇`,
    indexes: {
      total,
      st,
      exhibition,
      raceFlow,
      local
    },
    roleScores: {
      attack,
      flow,
      hold,
      pickup,
      road
    }
  };
}

const analyses = [
  boat(1, { total: 72, st: 58, exhibition: 58, hold: 86 }),
  boat(2, { total: 69, st: 60, exhibition: 60, hold: 81 }),
  boat(3, {
    total: 86,
    st: 88,
    exhibition: 86,
    raceFlow: 89,
    attack: 92,
    flow: 88,
    hold: 63,
    pickup: 74,
    road: 72
  }),
  boat(4, {
    total: 67,
    st: 62,
    exhibition: 61,
    attack: 68,
    flow: 66,
    hold: 67,
    pickup: 70,
    road: 69
  }),
  boat(5, {
    total: 66,
    st: 64,
    exhibition: 65,
    local: 82,
    attack: 66,
    flow: 84,
    hold: 58,
    pickup: 88,
    road: 80
  }),
  boat(6, {
    total: 62,
    st: 63,
    exhibition: 63,
    local: 76,
    attack: 61,
    flow: 74,
    hold: 55,
    pickup: 83,
    road: 86
  })
];

const data = {
  stadiumCode: "12",
  raceNo: 8,
  entries: analyses.map((analysis) => ({
    boat: analysis.boatNo,
    racerName: analysis.playerName,
    avgSt: 0.15,
    exhibitionTime: 6.8
  }))
};

const result = aiCore.buildRaceScenarios(analyses, data);

assert.deepEqual(
  result.scenarios.map((scenario) => scenario.type).sort(),
  ["escape", "fourAttack", "sashi", "threeAttack"]
);

assert.equal(result.mainScenario.type, "threeAttack");
assert.equal(result.attacker, 3);
assert.equal(result.wallBoat, 2);
assert.deepEqual(result.blockedBoats, [4]);
assert.equal(result.confidence, result.mainScenario.score);

assert.deepEqual(result.remainers, [1, 2, 4]);
assert.ok(!result.followers.includes(result.attacker));
assert.equal(result.followers[0], 5);
assert.equal(result.pickupCandidates[0], 5);
assert.equal(result.roadRaceBoats[0], 6);
assert.deepEqual(result.localExperts, [5, 6]);

assert.equal(result.evidence.scenario, "3コース攻め");
assert.equal(result.evidence.score, result.confidence);
assert.ok(result.evidence.mainGap >= 0);
assert.ok(result.evidence.firstCandidates.includes(3));
assert.equal(result.dataStatus.hasSt, true);
assert.equal(result.dataStatus.hasExhibition, true);

console.log("展開シナリオエンジン専用テスト: 合格");
console.log("- 4展開: 1逃げ・2差し・3攻め・4カド");
console.log("- 役割: 攻め・壁・残し・展開・拾い・道中・当地");
console.log("- このテスト範囲: 展開と役割出力");
