"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const sandbox = {
  window: {},
  console,
  setTimeout,
  clearTimeout
};

vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync(
    path.join(__dirname, "..", "js", "ai-core.js"),
    "utf8"
  ),
  sandbox
);

const aiCore = sandbox.window.ChappyAICore;
assert.equal(
  typeof aiCore.buildHoldPickupTheory,
  "function",
  "残し・拾いVer2の共通判定を公開する"
);

function entries(courseOrder = [1, 2, 3, 4, 5, 6]) {
  return courseOrder.map((boatNo, index) => ({
    boatNo,
    startExhibition: {
      boat: boatNo,
      course: index + 1,
      isOfficialCourse: true,
      mappingSource: "official-start-image"
    }
  }));
}

function analyses() {
  return [1, 2, 3, 4, 5, 6].map((boatNo) => ({
    boatNo,
    playerName: `${boatNo}号艇`
  }));
}

function scenario(type, attacker, blockedBoats = []) {
  const labels = {
    escape: "1号艇逃げ",
    sashi: "2コース差し",
    threeAttack: "3コース攻め",
    fourAttack: "4カド攻め"
  };

  return {
    type,
    label: labels[type],
    attacker,
    blockedBoats
  };
}

function wall(overrides = {}) {
  return {
    wallBoat: null,
    wallCandidateNo: null,
    state: "対象外",
    ...overrides
  };
}

function boatNos(candidates) {
  return candidates.map((boat) => boat.boatNo);
}

function assertFormalTheory(theory, attackerBoatNo) {
  assert.equal(theory.isFormal, true);
  assert.equal(theory.isProvisional, false);
  assert.equal(theory.attackerBoatNo, attackerBoatNo);
  assert.ok(theory.secondCandidates.length <= 3);
  assert.ok(theory.thirdCandidates.length <= 4);
  assert.ok(
    !boatNos(theory.secondCandidates).includes(attackerBoatNo),
    "中心艇を2着候補から除外する"
  );
  assert.ok(
    !boatNos(theory.thirdCandidates).includes(attackerBoatNo),
    "中心艇を3着候補から除外する"
  );

  for (const role of theory.roles) {
    for (const key of ["hold", "pickup"]) {
      const result = role[key];
      assert.ok(result.score >= 1 && result.score <= 100);

      if (result.isAdopted) {
        assert.ok(result.score >= 65);
      }
      if (result.isReference) {
        assert.ok(result.score >= 55 && result.score < 65);
      }
    }
  }
}

const standardEntries = entries();
const standardAnalyses = analyses();

const escape = aiCore.buildHoldPickupTheory(
  standardEntries,
  standardAnalyses,
  scenario("escape", 1),
  wall()
);
assertFormalTheory(escape, 1);
assert.deepEqual(
  boatNos(escape.secondCandidates),
  [2, 4, 3],
  "1逃げは2・3・4コースの残しだけを順位化する"
);
assert.deepEqual(
  new Set(boatNos(escape.thirdCandidates)),
  new Set([3, 4, 5, 6]),
  "1逃げは3～6コースの拾いだけを正式候補化する"
);

const sashi = aiCore.buildHoldPickupTheory(
  standardEntries,
  standardAnalyses,
  scenario("sashi", 2),
  wall({
    wallBoat: 1,
    wallCandidateNo: 1,
    state: "壁成立"
  })
);
assertFormalTheory(sashi, 2);
assert.equal(
  sashi.secondCandidates[0].boatNo,
  1,
  "2差し時は1号艇の残しを最上位に保護する"
);
assert.ok(
  boatNos(sashi.secondCandidates).includes(4),
  "2差し時も4号艇の残し経路を評価する"
);

const threeAttack = aiCore.buildHoldPickupTheory(
  standardEntries,
  standardAnalyses,
  scenario("threeAttack", 3, [4]),
  wall({
    wallBoat: 2,
    wallCandidateNo: 2,
    state: "壁成立"
  })
);
assertFormalTheory(threeAttack, 3);
assert.deepEqual(
  boatNos(threeAttack.secondCandidates),
  [1, 2],
  "3攻めは1・2の残しへ限定する"
);
assert.deepEqual(
  boatNos(threeAttack.thirdCandidates),
  [5, 6],
  "3攻めは5・6の展開拾いへ限定する"
);
assert.equal(
  threeAttack.secondCandidates[1].isEquivalentToPrevious,
  true,
  "2点以内は同等評価として扱う"
);
assert.equal(
  threeAttack.roles.find((boat) => boat.boatNo === 4)
    .hold.reason,
  "最有力展開で攻め場を失うため除外",
  "3攻め時は4コースの攻め場消失を優先する"
);

const fourAttack = aiCore.buildHoldPickupTheory(
  standardEntries,
  standardAnalyses,
  scenario("fourAttack", 4),
  wall({
    wallBoat: 3,
    wallCandidateNo: 3,
    state: "壁成立"
  })
);
assertFormalTheory(fourAttack, 4);
assert.deepEqual(
  new Set(boatNos(fourAttack.secondCandidates)),
  new Set([1, 3, 5]),
  "4カド攻めは1・3・5の残しを正式評価する"
);
assert.deepEqual(
  new Set(boatNos(fourAttack.thirdCandidates)),
  new Set([2, 5, 6]),
  "4カド攻めは2・5・6の拾いを正式評価する"
);
assert.equal(
  fourAttack.roles.find((boat) => boat.boatNo === 5)
    .hasIndependentDualEvidence,
  true,
  "2着・3着の両方へ入る艇は独立した成立根拠を持つ"
);
assert.deepEqual(
  JSON.parse(JSON.stringify(fourAttack.thresholds)),
  {
    adopted: 65,
    reference: 55,
    equivalentDifference: 2,
    secondLimit: 3,
    thirdLimit: 4
  }
);

const collapsedWall = aiCore.buildHoldPickupTheory(
  standardEntries,
  standardAnalyses,
  scenario("sashi", 2),
  wall({
    wallBoat: null,
    wallCandidateNo: 1,
    state: "壁崩れ"
  })
);
assert.ok(
  collapsedWall.roles.find((boat) => boat.boatNo === 1)
    .hold.score <
  sashi.roles.find((boat) => boat.boatNo === 1)
    .hold.score,
  "壁崩れ時は壁成立の残存経路点を与えない"
);

const swapped = aiCore.buildHoldPickupTheory(
  entries([1, 2, 4, 3, 5, 6]),
  standardAnalyses,
  scenario("threeAttack", 3, [4]),
  wall({
    wallBoat: 2,
    wallCandidateNo: 2,
    state: "壁成立"
  })
);
assertFormalTheory(swapped, 4);
assert.equal(
  swapped.roles.find((boat) => boat.boatNo === 4)
    .isAttackSource,
  true,
  "艇番ではなく実進入3コースの艇を中心艇にする"
);
assert.equal(
  swapped.roles.find((boat) => boat.boatNo === 3)
    .isBlocked,
  true,
  "実進入4コースの艇を攻め場消失として除外する"
);

const missing = aiCore.buildHoldPickupTheory(
  standardEntries.slice(0, 5),
  standardAnalyses.slice(0, 5),
  scenario("escape", 1),
  wall()
);
assert.equal(missing.isFormal, false);
assert.equal(missing.isProvisional, true);
assert.deepEqual(boatNos(missing.secondCandidates), []);
assert.deepEqual(boatNos(missing.thirdCandidates), []);
assert.ok(
  missing.roles.every(
    (boat) =>
      boat.hold.score === 50 &&
      boat.pickup.score === 50 &&
      boat.hold.status === "暫定" &&
      boat.pickup.status === "暫定"
  ),
  "データ不足時は弱い候補で枠を埋めず中立50点にする"
);

console.log("残し・拾い理論Ver2専用テスト: 合格");
console.log("- 1逃げ・2差し・3攻め・4カドを別経路で判定");
console.log("- 中心艇・攻め場消失艇を2着／3着候補から除外");
console.log("- 実進入変更とデータ不足時の中立50点を確認");
