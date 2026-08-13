"use strict";

const assert = require("node:assert/strict");

global.window = global;
require("../js/utils");
require("../js/ai-core");
require("../js/theory");

const aiCore = global.ChappyAICore;
const theory = global.ChappyTheory;

function entry(boatNo, exhibitionTime, lapTime) {
  return {
    boatNo,
    racerName: `${boatNo}号艇`,
    avgSt: 0.15,
    exhibitionSt: 0.15,
    exhibitionTime,
    lapTime
  };
}

function analysis(boatNo, roleScore = 65) {
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
      hold: 65,
      pickup: roleScore,
      road: roleScore
    }
  };
}

const entries = [
  entry(1, 6.82, 37.72),
  entry(2, 6.80, 37.70),
  entry(3, 6.79, 37.68),
  entry(4, 6.70, 37.50),
  entry(5, 6.76, 37.62),
  entry(6, 6.78, 37.66)
];
const analyses = entries.map((boat) => analysis(boat.boatNo));

const result = aiCore.buildDoubleTime(entries, analyses);

assert.equal(result.isDouble, true);
assert.equal(result.topBoat, 4);
assert.equal(result.activeBoat, 4);
assert.equal(result.isOuterTarget, true);
assert.equal(result.isLinkable, true);
assert.equal(result.linkRole, "攻め");
assert.equal(result.exhibitionGap, 0.06);
assert.equal(result.lapGap, 0.12);
assert.equal(result.confidence, 88);
assert.equal(result.scoreAdjustment, 0);

const scenarios = aiCore.buildRaceScenarios(analyses, {
  stadiumCode: "12",
  entries
});
const fourAttack = scenarios.scenarios.find(
  (scenario) => scenario.type === "fourAttack"
);
const boat4Outcome = fourAttack.outcome.boats.find(
  (boat) => boat.boatNo === 4
);

assert.equal(fourAttack.doubleTimeAdjustment, 0);
assert.ok(
  boat4Outcome.reasons.every((reason) =>
    !reason.includes("ダブルタイム")
  ),
  "ダブルタイムを展開・着順候補へ別枠加点しない"
);
assert.equal(scenarios.evidence.doubleTime.activeBoat, 4);

const weakAnalyses = analyses.map((boat) =>
  boat.boatNo === 4 ? analysis(4, 55) : boat
);
const weakResult = aiCore.buildDoubleTime(entries, weakAnalyses);

assert.equal(weakResult.isDouble, true);
assert.equal(weakResult.topBoat, 4);
assert.equal(weakResult.isLinkable, false);
assert.equal(weakResult.activeBoat, 4);
assert.equal(weakResult.scoreAdjustment, 0);

const innerEntries = entries.map((boat) => ({ ...boat }));
innerEntries[0].exhibitionTime = 6.60;
innerEntries[0].lapTime = 37.30;
const innerResult = aiCore.buildDoubleTime(innerEntries, analyses);

assert.equal(innerResult.isDouble, true);
assert.equal(innerResult.topBoat, 1);
assert.equal(innerResult.isOuterTarget, false);
assert.equal(innerResult.activeBoat, 1);
assert.equal(innerResult.scoreAdjustment, 0);

const incompleteEntries = entries.map((boat) => ({ ...boat }));
delete incompleteEntries[3].lapTime;
const incompleteResult = aiCore.buildDoubleTime(
  incompleteEntries,
  analyses
);

assert.notEqual(
  incompleteResult.topBoat,
  4,
  "一周タイム不足の4号艇をダブルタイムにしない"
);

const splitEntries = entries.map((boat) => ({ ...boat }));
splitEntries[4].lapTime = 37.40;
const splitResult = aiCore.buildDoubleTime(splitEntries, analyses);

assert.equal(splitResult.isDouble, false);
assert.equal(splitResult.topBoat, null);
assert.equal(splitResult.activeBoat, null);

const theoryResult = theory.calcDoubleTime(entries);

assert.equal(theoryResult.isDouble, true);
assert.equal(theoryResult.topBoat, 4);
assert.equal(theoryResult.confidence, 88);
assert.equal(theoryResult.isOuterTarget, true);
assert.equal(
  Object.hasOwn(theoryResult, "topCourse"),
  false,
  "枠なり時の既存公開shapeを維持する"
);

const swappedCourseEntries = entries.map(boat => ({
  ...boat,
  startExhibition: {
    boat: boat.boatNo,
    course:
      boat.boatNo === 2
        ? 4
        : boat.boatNo === 4
          ? 2
          : boat.boatNo,
    isOfficialCourse: true,
    mappingSource: "official-start-image"
  }
}));
const swappedTheoryResult = theory.calcDoubleTime(
  swappedCourseEntries
);
assert.equal(swappedTheoryResult.topBoat, 4);
assert.equal(swappedTheoryResult.topCourse, 2);
assert.equal(
  swappedTheoryResult.isOuterTarget,
  false,
  "ダブルタイム対象の内外を物理艇番ではなく実コースで判定する"
);

console.log("ダブルタイム理論専用テスト: 合格");
console.log("- 展示1位＋一周1位が同じ艇のときだけ成立");
console.log("- 2位との差から信頼度70〜100点");
console.log("- 展示・足100点内の5点要素として統合");
console.log("- 展開・役割・着順候補への別枠加点なし");
