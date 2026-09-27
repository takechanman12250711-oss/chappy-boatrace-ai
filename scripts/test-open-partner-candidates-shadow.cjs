"use strict";
const assert = require("node:assert/strict");
const { buildOpenPartnerCandidates } = require("./open-partner-candidates-shadow.cjs");

function row(boatNo, hold, pickup, road=50, flow=50, total=50) {
  return { boatNo, roleScores:{hold,pickup,road,flow}, indexes:{total} };
}

const analyses = [
  row(1,90,45), row(2,80,88), row(3,99,99),
  row(4,78,92), row(5,70,85), row(6,68,82)
];

const threeAttack = buildOpenPartnerCandidates({
  analyses, attackerBoatNo:3, blockedBoats:[4]
});
assert.equal(threeAttack.constraints.fixedCourseGate, false);
assert.ok(threeAttack.thirdCandidates.some(x => x.boatNo === 2),
  "3攻めでも2号艇を3着候補からコースだけで排除しない");
assert.ok(!threeAttack.secondCandidates.some(x => x.boatNo === 3));
assert.ok(!threeAttack.thirdCandidates.some(x => x.boatNo === 3));
assert.ok(!threeAttack.secondCandidates.some(x => x.boatNo === 4));
assert.ok(!threeAttack.thirdCandidates.some(x => x.boatNo === 4));

const skillChanged = analyses.map(x => x.boatNo === 6
  ? row(6,99,99,99,99,99) : x);
const changed = buildOpenPartnerCandidates({
  analyses:skillChanged, attackerBoatNo:3, blockedBoats:[4]
});
assert.equal(changed.secondCandidates[0].boatNo, 6,
  "既存の個別評価が変われば2着順位も変わる");
assert.equal(changed.thirdCandidates[0].boatNo, 6,
  "既存の個別評価が変われば3着順位も変わる");

const inputCopy = JSON.stringify(analyses);
buildOpenPartnerCandidates({ analyses, attackerBoatNo:1 });
assert.equal(JSON.stringify(analyses), inputCopy, "入力を変更しない");

console.log("open partner shadow tests: PASS");
