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

const formationsBefore = aiCore.buildFormations(analyses);
const raceScenarios = aiCore.buildRaceScenarios(analyses, data);
const marks = aiCore.buildMarks(analyses, raceScenarios);
const formationsAfter = aiCore.buildFormations(analyses);
const predictionData = aiCore.buildPredictionData(data);

assert.equal(raceScenarios.mainScenario.type, "threeAttack");
assert.equal(marks.honmei.boatNo, 3);
assert.equal(marks.taikou.boatNo, 1);
assert.equal(marks.ana.boatNo, 5);
assert.equal(marks.osae.boatNo, 2);
assert.equal(marks.scenario, "3コース攻め");
assert.equal(marks.confidence, raceScenarios.confidence);
assert.equal(marks.evidence.source, "raceScenarios");
assert.ok(!marks.evidence.blockedBoats.includes(marks.ana.boatNo));
assert.equal(
  predictionData.marks.evidence.source,
  "raceScenarios",
  "最終予想データへ展開由来の印を渡す"
);

assert.equal(
  new Set([
    marks.honmei.boatNo,
    marks.taikou.boatNo,
    marks.ana.boatNo,
    marks.osae.boatNo
  ]).size,
  4
);

assert.deepEqual(
  formationsAfter,
  formationsBefore,
  "Phase2 STEP2では既存買い目を変更しない"
);

assert.deepEqual(
  {
    main: formationsAfter.main,
    safety: formationsAfter.safety,
    flow: formationsAfter.flow,
    longshot: formationsAfter.longshot,
    axis: formationsAfter.axis
  },
  {
    main: [
      "1-3-5",
      "1-2-5",
      "1-4-5",
      "1-3-6",
      "1-2-6",
      "1-4-6"
    ],
    safety: [
      "3-1-5",
      "3-1-6",
      "3-1-4",
      "3-1-2",
      "3-2-5",
      "3-2-6",
      "3-2-4",
      "3-4-5"
    ],
    flow: [
      "1-3-2",
      "1-3-4",
      "1-3-5",
      "1-3-6",
      "1-2-3",
      "1-2-4",
      "1-2-5",
      "1-2-6",
      "1-4-2",
      "1-4-3",
      "1-4-5",
      "1-4-6"
    ],
    longshot: [
      "5-3-6",
      "5-3-4",
      "5-3-2",
      "5-3-1",
      "5-1-6",
      "5-1-3",
      "5-1-4",
      "5-1-2"
    ],
    axis: {
      honmei: 1,
      taikou: 3,
      ana: 5,
      osae: 2
    }
  },
  "本線を2着候補へ分散し、押さえ・流し・穴・軸は維持する"
);

console.log("展開シナリオ印接続テスト: 合格");
console.log("- ◎○▲△: 最有力展開と役割艇から決定");
console.log("- 3攻め時: ◎3 ○1 ▲5 △2");
console.log("- 流し: 1着固定・2着1〜3艇・3着全へ更新");
