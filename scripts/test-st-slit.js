"use strict";

const assert = require("node:assert/strict");

global.window = global;
require("../js/utils");
require("../js/ai-core");
require("../js/theory");

const aiCore = global.ChappyAICore;
const theory = global.ChappyTheory;

function entry(boatNo, exhibitionSt, avgSt = 0.15, currentSt = []) {
  return {
    boatNo,
    racerName: `${boatNo}号艇`,
    avgSt,
    exhibitionSt,
    currentSeries: { st: currentSt },
    exhibitionTime: 6.8,
    lapTime: 37.5
  };
}

const entries = [
  entry(1, 0.14),
  entry(2, 0.16),
  entry(3, 0.04, 0.14, [0.12, 0.14, 0.13]),
  entry(4, 0.18),
  entry(5, 0.15),
  entry(6, 0.16)
];

const slit = aiCore.buildSlitAnalysis(entries, {
  inPower: 60,
  sashi: 60,
  makuri: 60,
  kado: 60,
  makuriSashi: 60,
  outside: 60
});

const boat3 = slit.ranking.find((boat) => boat.boatNo === 3);
const boat4 = slit.ranking.find((boat) => boat.boatNo === 4);

assert.equal(slit.source, "neighbor-exhibition-st");
assert.equal(slit.threshold, 0.10);
assert.equal(slit.attackBoat, 3);
assert.equal(boat3.slitAlert, true);
assert.equal(boat3.slitDiff, 0.14);
assert.equal(boat3.comparedBoatNo, 4);
assert.equal(boat3.isStableBoat, true);
assert.equal(boat4.slitAlert, false, "遅い側を攻め警報にしない");
assert.equal(boat4.slitRisk, true);
assert.equal(boat4.slitLossDiff, 0.14);

const data = {
  stadiumCode: "12",
  entries
};

const analyses = entries.map((boat) => ({
  boatNo: boat.boatNo,
  playerName: boat.racerName,
  indexes: {
    total: 65,
    st: 65,
    exhibition: 65,
    raceFlow: 65,
    local: 60
  },
  roleScores: {
    attack: 65,
    flow: 65,
    hold: 65,
    pickup: 65,
    road: 65
  }
}));

const scenarios = aiCore.buildRaceScenarios(analyses, data);
const threeAttack = scenarios.scenarios.find(
  (scenario) => scenario.type === "threeAttack"
);
const fourAttack = scenarios.scenarios.find(
  (scenario) => scenario.type === "fourAttack"
);

assert.equal(threeAttack.slitAdjustment, 8);
assert.equal(fourAttack.slitAdjustment, -8);
assert.equal(scenarios.evidence.slit.alerts[0].boatNo, 3);
assert.equal(scenarios.evidence.slit.risks[0].boatNo, 4);

const noExhibition = entries.map(({ exhibitionSt, ...boat }) => boat);
const noExhibitionSlit = aiCore.buildSlitAnalysis(noExhibition, {
  inPower: 60,
  sashi: 60,
  makuri: 60,
  kado: 60,
  makuriSashi: 60,
  outside: 60
});

assert.equal(noExhibitionSlit.alerts.length, 0);
assert.equal(noExhibitionSlit.risks.length, 0);
assert.equal(noExhibitionSlit.attackBoat, null);

const theoryAlerts = theory.calcSlitAlerts([
  { boatNo: 3, course: 3, exhibitionST: 0.04 },
  { boatNo: 1, course: 1, exhibitionST: 0.14 },
  { boatNo: 4, course: 4, exhibitionST: 0.18 },
  { boatNo: 2, course: 2, exhibitionST: 0.16 }
]);

assert.deepEqual(
  theoryAlerts.map((alert) => alert.boatNo),
  [3],
  "理論表示も進入順の符号付き比較で速い艇だけを警報にする"
);
assert.equal(theoryAlerts[0].comparedBoatNo, 4);
assert.equal(theoryAlerts[0].diff, 0.14);

const unsupportedEntries = entries.map((boat) => ({
  ...boat,
  avgSt: null,
  currentSeries: { st: [] }
}));
const unsupportedAnalyses = unsupportedEntries.map((boat) => ({
  boatNo: boat.boatNo,
  playerName: boat.racerName,
  indexes: {
    total: 65,
    st: 65,
    exhibition: 65,
    raceFlow: 65,
    local: 60
  },
  roleScores: {
    attack: 65,
    flow: 65,
    hold: 65,
    pickup: 65,
    road: 65
  }
}));
const unsupportedScenarios = aiCore.buildRaceScenarios(
  unsupportedAnalyses,
  { stadiumCode: "12", entries: unsupportedEntries }
);
const unsupportedThree = unsupportedScenarios.scenarios.find(
  (scenario) => scenario.type === "threeAttack"
);

assert.equal(
  unsupportedThree.slitAdjustment,
  0,
  "平均・今節STの裏付けがない単発展示STだけでは展開を加点しない"
);

console.log("ST・スリット理論専用テスト: 合格");
console.log("- 展示STの隣艇比較だけで0.10以上を発動");
console.log("- 速い艇と遅い艇を分離");
console.log("- 平均ST・今節STは安定性の裏付け");
console.log("- 4展開への補正は最大±8点");
