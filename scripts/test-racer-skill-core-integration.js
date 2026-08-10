"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

global.window = global;

function skillRole(
  boatNo,
  coursePerformance,
  methodFit,
  recentTrend
) {
  return {
    boatNo,
    isFormal: true,
    appliedToScore: false,
    components: {
      coursePerformance,
      courseStart: 15,
      methodFit,
      recentTrend,
      classNational: 15,
      seriesRoad: 5,
      scenarioRole: 5
    }
  };
}

function candidate(boatNo, score) {
  return {
    boatNo,
    score,
    roleScore: score
  };
}

function ticket(ticket, priorityScore) {
  return {
    ticket,
    priorityScore,
    category: "本線"
  };
}

const basePrediction = {
  raceFlow: {
    title: "3コース攻め本線",
    attackBoats: [
      { boatNo: 3, score: 90 }
    ],
    holdBoats: [
      candidate(2, 80),
      candidate(4, 79),
      candidate(1, 70)
    ],
    pickupBoats: [
      candidate(5, 72),
      candidate(6, 71)
    ]
  },
  mainSheet: {
    honmei: { boatNo: 3, score: 88 },
    taikou: { boatNo: 2, score: 80 },
    ana: { boatNo: 5, score: 72 },
    osae: { boatNo: 4, score: 79 },
    evaluations: [
      { boatNo: 1, total: 68 },
      { boatNo: 2, total: 72 },
      { boatNo: 3, total: 88 },
      { boatNo: 4, total: 71 },
      { boatNo: 5, total: 69 },
      { boatNo: 6, total: 67 }
    ],
    tickets: [
      ticket("3-2-5", 80),
      ticket("3-4-6", 80)
    ],
    coverTickets: [
      ticket("3-2-6", 70),
      ticket("3-4-5", 70)
    ],
    flowTickets: []
  },
  manshuSheet: {
    tickets: []
  },
  ticketSheets: {
    main: [
      ticket("3-2-5", 80),
      ticket("3-4-6", 80)
    ],
    cover: [
      ticket("3-2-6", 70),
      ticket("3-4-5", 70)
    ],
    flow: [],
    hole: [],
    all: [
      ticket("3-2-5", 80),
      ticket("3-4-6", 80),
      ticket("3-2-6", 70),
      ticket("3-4-5", 70)
    ]
  },
  aiTicketList: [
    ticket("3-2-5", 80),
    ticket("3-4-6", 80)
  ],
  holdPickupTheory: {
    isFormal: true,
    secondCandidates: [
      candidate(2, 80),
      candidate(4, 79),
      candidate(1, 70)
    ],
    thirdCandidates: [
      candidate(5, 72),
      candidate(6, 71)
    ]
  },
  racerSkillTheory: {
    isFormal: true,
    appliedToScore: false,
    roles: [
      skillRole(1, 10, 0, 4),
      skillRole(2, 12, 3, 5),
      skillRole(3, 25, 20, 15),
      skillRole(4, 24, 18, 14),
      skillRole(5, 13, 4, 5),
      skillRole(6, 23, 16, 13)
    ]
  },
  aiCore: {
    holdPickupTheory: null,
    racerSkillTheory: null
  }
};

basePrediction.aiCore.holdPickupTheory =
  basePrediction.holdPickupTheory;
basePrediction.aiCore.racerSkillTheory =
  basePrediction.racerSkillTheory;

const originalTotals =
  basePrediction.mainSheet.evaluations
    .map((row) => [row.boatNo, row.total]);
const originalHead =
  basePrediction.mainSheet.honmei.boatNo;
const originalScenario =
  basePrediction.raceFlow.title;

global.createPrediction = () =>
  JSON.parse(JSON.stringify(basePrediction));

const integration = require(
  "../js/racer-skill-core-integration"
);

const prediction = global.createPrediction({});

assert.equal(
  prediction.racerSkillCoreIntegration.applied,
  true,
  "技量Ver2を最終予想の同等候補比較へ接続する"
);
assert.equal(
  prediction.mainSheet.honmei.boatNo,
  originalHead,
  "技量で本命頭を変更しない"
);
assert.equal(
  prediction.raceFlow.title,
  originalScenario,
  "技量で主展開を変更しない"
);
assert.deepEqual(
  prediction.mainSheet.evaluations
    .map((row) => [row.boatNo, row.total]),
  originalTotals,
  "技量Ver2を既存総合点へ二重加算しない"
);

assert.deepEqual(
  prediction.holdPickupTheory.secondCandidates
    .map((row) => row.boatNo),
  [4, 2, 1],
  "2着残しが2点以内なら実進入別技量で同等候補を並べ替える"
);
assert.deepEqual(
  prediction.holdPickupTheory.thirdCandidates
    .map((row) => row.boatNo),
  [6, 5],
  "3着拾いが2点以内なら実進入別技量で同等候補を並べ替える"
);
assert.deepEqual(
  prediction.raceFlow.holdBoats
    .map((row) => row.boatNo),
  [4, 2, 1],
  "残しの最終優先順へ技量タイブレークを渡す"
);
assert.deepEqual(
  prediction.raceFlow.pickupBoats
    .map((row) => row.boatNo),
  [6, 5],
  "拾いの最終優先順へ技量タイブレークを渡す"
);

const strongTicket =
  prediction.mainSheet.tickets.find(
    (row) => row.ticket === "3-4-6"
  );
const weakTicket =
  prediction.mainSheet.tickets.find(
    (row) => row.ticket === "3-2-5"
  );

assert.equal(
  strongTicket.priorityScore,
  82,
  "同等候補内の技量上位を買い目優先度へ最大+2点だけ反映する"
);
assert.equal(
  weakTicket.priorityScore,
  80,
  "技量下位へ一律加点せず既存優先度を維持する"
);
assert.equal(
  strongTicket.racerSkillTieBreak.bonus,
  2
);

const wideGap = integration.enhance({
  ...JSON.parse(JSON.stringify(basePrediction)),
  holdPickupTheory: {
    isFormal: true,
    secondCandidates: [
      candidate(2, 80),
      candidate(4, 76)
    ],
    thirdCandidates: []
  },
  aiCore: {
    ...JSON.parse(JSON.stringify(basePrediction.aiCore)),
    holdPickupTheory: {
      isFormal: true,
      secondCandidates: [
        candidate(2, 80),
        candidate(4, 76)
      ],
      thirdCandidates: []
    }
  }
});

assert.deepEqual(
  wideGap.holdPickupTheory.secondCandidates
    .map((row) => row.boatNo),
  [2, 4],
  "残し・拾いの差が3点以上なら技量で逆転させない"
);
assert.equal(
  wideGap.racerSkillCoreIntegration,
  undefined,
  "同等候補がなければ技量補正自体を発動しない"
);

const uniqueOnly = integration.uniqueSkillScore(
  skillRole(4, 24, 18, 14)
);
assert.equal(
  uniqueOnly,
  56,
  "コース実績・戦法適性・年次推移だけを技量タイブレークに使う"
);

const loader = fs.readFileSync(
  path.join(__dirname, "../js/prediction-runtime-loader.js"),
  "utf8"
);
const predictionPosition =
  loader.indexOf('"js/prediction.js"');
const integrationPosition =
  loader.indexOf('"js/racer-skill-core-integration.js"');
const practicalPosition =
  loader.indexOf('"js/practical-selection.js"');

assert.ok(
  predictionPosition >= 0 &&
  integrationPosition > predictionPosition &&
  practicalPosition > integrationPosition,
  "prediction直後・実戦厳選前に技量コア接続を読み込む"
);

console.log("技量Ver2 コア接続テスト: 合格");
console.log("- 主展開・本命頭・既存総合点は不変");
console.log("- 残し/拾い2点以内だけ技量固有3要素で比較");
console.log("- 買い目priorityScoreへ最大+2点で接続");
