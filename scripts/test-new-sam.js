"use strict";

const assert = require("node:assert/strict");

global.window = global;
require("../js/utils");
require("../js/ai-core");
require("../js/theory");

const aiCore = global.ChappyAICore;
const theory = global.ChappyTheory;

function entry(boatNo, total) {
  const exhibitionTime = 6.80;

  return {
    boatNo,
    racerName: `${boatNo}号艇`,
    avgSt: 0.15,
    exhibitionSt: 0.15,
    exhibitionTime,
    lapTime: total - exhibitionTime
  };
}

function analysis(boatNo, roleScore = 70) {
  return {
    boatNo,
    playerName: `${boatNo}号艇`,
    indexes: {
      total: roleScore,
      st: 65,
      exhibition: 65,
      raceFlow: roleScore,
      local: 60
    },
    roleScores: {
      attack: roleScore,
      flow: roleScore,
      hold: roleScore,
      pickup: roleScore,
      road: roleScore
    }
  };
}

const entries = [
  entry(1, 44.15),
  entry(2, 44.25),
  entry(3, 44.33),
  entry(4, 44.45),
  entry(5, 44.82),
  entry(6, 45.00)
];
const analyses = entries.map((boat) => analysis(boat.boatNo));

const result = aiCore.buildNewSam(entries, analyses);

assert.equal(result.isFormal, true);
assert.equal(result.average, 44.5);
assert.deepEqual(result.missingBoatNos, []);
assert.equal(result.ranking.find((boat) => boat.boatNo === 1).grade, "S");
assert.equal(result.ranking.find((boat) => boat.boatNo === 1).scoreAdjustment, 0);
assert.equal(result.ranking.find((boat) => boat.boatNo === 2).grade, "A");
assert.equal(result.ranking.find((boat) => boat.boatNo === 2).scoreAdjustment, 0);
assert.equal(result.ranking.find((boat) => boat.boatNo === 3).grade, "B");
assert.equal(result.ranking.find((boat) => boat.boatNo === 3).scoreAdjustment, 0);
assert.equal(result.ranking.find((boat) => boat.boatNo === 4).grade, "C");
assert.equal(result.ranking.find((boat) => boat.boatNo === 4).scoreAdjustment, 0);
assert.equal(result.ranking.find((boat) => boat.boatNo === 5).grade, "D");
assert.equal(result.ranking.find((boat) => boat.boatNo === 5).scoreAdjustment, 0);

const scenarios = aiCore.buildRaceScenarios(analyses, {
  stadiumCode: "12",
  entries
});

assert.equal(
  scenarios.scenarios.find((scenario) => scenario.type === "escape")
    .newSamAdjustment,
  0
);
assert.equal(
  scenarios.scenarios.find((scenario) => scenario.type === "sashi")
    .newSamAdjustment,
  0
);
assert.equal(
  scenarios.scenarios.find((scenario) => scenario.type === "threeAttack")
    .newSamAdjustment,
  0
);
assert.equal(
  scenarios.scenarios.find((scenario) => scenario.type === "fourAttack")
    .newSamAdjustment,
  0
);
assert.deepEqual(scenarios.evidence.newSam.activeBoats, [1, 2, 3]);

const weakAnalyses = analyses.map((boat) =>
  boat.boatNo === 1 ? analysis(1, 55) : boat
);
const weakResult = aiCore.buildNewSam(entries, weakAnalyses);

assert.equal(weakResult.ranking.find((boat) => boat.boatNo === 1).grade, "S");
assert.equal(
  weakResult.ranking.find((boat) => boat.boatNo === 1).scoreAdjustment,
  0,
  "役割の裏付けが弱い場合はS評価でも加点しない"
);

const incompleteEntries = entries.map((boat) => ({ ...boat }));
delete incompleteEntries[5].lapTime;
const incomplete = aiCore.buildNewSam(incompleteEntries, analyses);

assert.equal(incomplete.isFormal, false);
assert.deepEqual(incomplete.missingBoatNos, [6]);
assert.equal(incomplete.topBoat, null);
assert.ok(
  incomplete.ranking.every((boat) => boat.scoreAdjustment === 0),
  "6艇未満では参考表示だけにする"
);

const outerEntries = [
  entry(1, 44.82),
  entry(2, 44.45),
  entry(3, 45.00),
  entry(4, 44.33),
  entry(5, 44.15),
  entry(6, 44.25)
];
const outerAnalyses = outerEntries.map((boat) => analysis(boat.boatNo));
const outerScenarios = aiCore.buildRaceScenarios(outerAnalyses, {
  stadiumCode: "12",
  entries: outerEntries
});
const outerThreeAttack = outerScenarios.scenarios.find(
  (scenario) => scenario.type === "threeAttack"
);
const boat5 = outerThreeAttack.outcome.boats.find(
  (boat) => boat.boatNo === 5
);

assert.ok(
  boat5.reasons.every((reason) =>
    !reason.includes("新サム")
  ),
  "新サムを攻め展開の拾いへ別枠加点しない"
);

const theoryResult = theory.calcNewSam(entries);

assert.equal(theoryResult.isFormal, true);
assert.equal(theoryResult.average, 44.5);
assert.equal(
  theoryResult.ranking.find((boat) => boat.boatNo === 1).grade,
  "S"
);
assert.equal(
  theoryResult.ranking.find((boat) => boat.boatNo === 6).grade,
  "D"
);

console.log("新サム理論専用テスト: 合格");
console.log("- 展示＋一周が6艇分そろった場合だけ正式判定");
console.log("- S/A/B/C/Dを小数3桁で統一");
console.log("- 展示・足100点内の20点要素として統合");
console.log("- 展開・役割・着順候補への別枠加点なし");
