"use strict";

const assert = require("node:assert/strict");

global.window = global;
require("../js/ai-core");
const selector = require("../js/practical-selection");

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

function raceData(analyses) {
  return {
    stadiumCode: "12",
    raceNo: 8,
    entries: analyses.map((analysis) => ({
      boat: analysis.boatNo,
      racerName: analysis.playerName,
      avgSt: 0.15,
      exhibitionTime: 6.8
    }))
  };
}

const threeAttack = [
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

const scenarios = aiCore.buildRaceScenarios(
  threeAttack,
  raceData(threeAttack)
);
const legacy = aiCore.buildFormations(threeAttack);
const connected = aiCore.buildFormations(threeAttack, scenarios);

assert.equal(scenarios.mainScenario.type, "threeAttack");
assert.equal(connected.evidence.source, "raceScenarios");
assert.equal(connected.evidence.scenarioType, "threeAttack");
assert.equal(connected.mainEstablished, true);
assert.deepEqual(connected.axis, {
  honmei: 3,
  taikou: 1,
  ana: 5,
  osae: 2
});

assert.ok(
  connected.main.every((ticket) => ticket.startsWith("3-")),
  "本線の頭を最有力展開の◎3号艇へ接続する"
);
const practicalMain = connected.main
  .slice(0, 3)
  .map((ticket) => ticket.split("-").map(Number));
assert.equal(
  practicalMain[0][1],
  practicalMain[1][1],
  "本線1・2点目は2着1位を使う"
);
assert.notEqual(
  practicalMain[0][2],
  practicalMain[1][2],
  "本線1・2点目は3着候補を分ける"
);
assert.notEqual(
  practicalMain[2][1],
  practicalMain[0][1],
  "本線3点目は2着2位へ分散する"
);
assert.ok(
  connected.safety.every((ticket) => ticket.startsWith("1-")),
  "押さえの頭をイン残しの○1号艇へ接続する"
);
assert.ok(
  connected.longshot.every((ticket) => ticket.startsWith("5-")),
  "万舟候補の頭を展開に乗る▲5号艇へ接続する"
);
assert.ok(
  !connected.main.slice(0, 3).some((ticket) => ticket.includes("-4")),
  "3攻めで攻め場を失う4号艇を実戦本線3点から除外する"
);
assert.notDeepEqual(
  connected.main,
  legacy.main,
  "Phase2 STEP3では展開に合わせて買い目を更新する"
);

const practical = selector.select({
  aiCore: { formations: connected },
  mainSheet: {
    tickets: connected.main,
    coverTickets: connected.safety,
    flowTickets: connected.flow
  },
  manshuSheet: { tickets: connected.longshot }
});

assert.equal(practical.status, "selected");
assert.deepEqual(
  practical.tickets
    .slice(0, 5)
    .map((ticket) => ticket.category),
  ["本線", "本線", "本線", "押さえ", "押さえ"],
  "Ver2でも基本5点を維持する"
);
assert.ok(
  practical.tickets.length >= 5 &&
  practical.tickets.length <= 7,
  "弱い候補で埋めず、実戦厳選は基本5点・最大7点にする"
);
assert.ok(
  practical.tickets
    .slice(5)
    .every((ticket) =>
      ticket.category === "流し" ||
      ticket.category === "万舟・穴"
    ),
  "追加点は根拠が成立した流し・万舟だけにする"
);

const unclear = [
  boat(1, { total: 68, raceFlow: 58, attack: 55, hold: 70 }),
  boat(2, { total: 67, raceFlow: 60, attack: 58, hold: 69 }),
  boat(3, { total: 66, raceFlow: 70, attack: 68, hold: 58 }),
  boat(4, { total: 65, raceFlow: 69, attack: 67, hold: 61 }),
  boat(5, { total: 62, raceFlow: 64, attack: 63, hold: 55 }),
  boat(6, { total: 60, raceFlow: 62, attack: 60, hold: 52 })
];
const unclearScenarios = aiCore.buildRaceScenarios(
  unclear,
  raceData(unclear)
);
const unclearFormation = aiCore.buildFormations(
  unclear,
  unclearScenarios
);

assert.equal(unclearFormation.mainEstablished, false);
assert.deepEqual(unclearFormation.main, []);

function assertScenarioHead(label, analyses, scenarioType, head) {
  const raceScenarios = aiCore.buildRaceScenarios(
    analyses,
    raceData(analyses)
  );
  const formations = aiCore.buildFormations(
    analyses,
    raceScenarios
  );

  assert.equal(
    raceScenarios.mainScenario.type,
    scenarioType,
    `${label}を最有力展開にする`
  );
  assert.equal(formations.axis.honmei, head);
  assert.ok(
    formations.main.every((ticket) =>
      ticket.startsWith(`${head}-`)
    ),
    `${label}の攻め艇を本線頭にする`
  );
}

assertScenarioHead("1逃げ", [
  boat(1, {
    total: 88,
    st: 88,
    exhibition: 88,
    raceFlow: 88,
    hold: 92
  }),
  boat(2, { total: 70, st: 58, exhibition: 58, hold: 75 }),
  boat(3, { total: 68, st: 58, exhibition: 58, attack: 63 }),
  boat(4, { total: 66, st: 58, exhibition: 58, attack: 62 }),
  boat(5),
  boat(6)
], "escape", 1);

assertScenarioHead("2差し", [
  boat(1, { total: 70, st: 55, exhibition: 55, hold: 82 }),
  boat(2, {
    total: 86,
    st: 90,
    exhibition: 90,
    raceFlow: 86,
    attack: 84,
    hold: 88
  }),
  boat(3, { total: 68, attack: 65 }),
  boat(4, { total: 66, attack: 64 }),
  boat(5),
  boat(6)
], "sashi", 2);

assertScenarioHead("4カド", [
  boat(1, { total: 70, st: 58, exhibition: 58, hold: 82 }),
  boat(2, { total: 68, st: 58, exhibition: 58, hold: 76 }),
  boat(3, { total: 69, st: 55, exhibition: 55, attack: 65 }),
  boat(4, {
    total: 88,
    st: 92,
    exhibition: 92,
    raceFlow: 90,
    attack: 92,
    hold: 72
  }),
  boat(5, { flow: 86, pickup: 88 }),
  boat(6, { pickup: 82, road: 85 })
], "fourAttack", 4);

console.log("展開シナリオ買い目接続テスト: 合格");
console.log("- 本線頭: 1逃げ・2差し・3攻め・4カドへ接続");
console.log("- 3攻め: 本線◎3・押さえ○1・万舟▲5");
console.log("- 実戦厳選: 本線3＋押さえ2＋流し1＋万舟1");
console.log("- 本線不成立: 従来どおり見送り");
console.log("- 新しい数値基準: 追加なし");
