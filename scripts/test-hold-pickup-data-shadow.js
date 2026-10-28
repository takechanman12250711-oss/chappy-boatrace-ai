"use strict";

const assert = require("node:assert/strict");
const shadow = require("./hold-pickup-data-shadow");
const ab = require("./build-hold-pickup-data-shadow-ab");

// 1号艇逃げ。現行の固定表では 2着=2・4・3、3着=3・4・5・6。
function boat(boatNo, hold, pickup, indexes, top3Rate, starts = 100) {
  return {
    boatNo,
    indexes,
    racerSkillTheory: {
      courseHistory: { all3Years: { top3Rate, starts } }
    },
    holdPickupTheory: {
      hold: { score: hold, isAdopted: hold >= 65 },
      pickup: { score: pickup, isAdopted: pickup >= 65 }
    }
  };
}

const weak = { st: 20, exhibition: 20, motor: 35, local: 40, national: 45, raceFlow: 50 };
const strong = { st: 90, exhibition: 92, motor: 68, local: 95, national: 98, raceFlow: 95 };

const basis = {
  courseMapping: { byBoat: { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6 } },
  raceScenarios: { headBoatNo: 1, mainScenario: { type: "escape" } },
  analyses: [
    boat(1, 1, 1, strong, 90),
    boat(2, 80, 1, weak, 20),
    boat(3, 74, 89, weak, 25),
    boat(4, 79, 88, strong, 70),
    boat(5, 1, 92, strong, 65),
    boat(6, 1, 90, weak, 15)
  ]
};

// 現行の並びは保存済みの固定表の点数そのまま
assert.deepEqual(shadow.baselineRanking(basis, "hold", 3), [2, 4, 3]);
assert.deepEqual(shadow.baselineRanking(basis, "pickup", 4), [5, 6, 3, 4]);

const result = shadow.evaluateRace(basis);
assert.equal(result.head, 1);
assert.deepEqual(result.baseline.main, ["1-2-5", "1-4-5", "1-3-5"]);

// データ併用では、データの強い4号艇が2着の先頭に来る
assert.equal(result.data.hold[0], 4);
// 候補数（購入点数）は現行と同じ
assert.equal(result.data.hold.length, result.baseline.hold.length);
assert.equal(result.data.pickup.length, result.baseline.pickup.length);
// 1着軸は変えない
assert.ok(result.data.main.every((t) => t.startsWith("1-")));
// 既定では顔ぶれは現行と同じ（順番だけ変わる）
assert.deepEqual(
  [...result.data.hold].sort(),
  [...result.baseline.hold].sort()
);

// 探索用の下限点を与えると、固定表で外れた艇（5号艇）も2着候補に入りうる
const open = shadow.evaluateRace(basis, { ineligibleFloor: 70 });
assert.ok(open.data.hold.includes(5));

// 実績が少ないコース成績は平均へ寄せる
assert.ok(
  shadow.courseTop3Score({
    racerSkillTheory: {
      courseHistory: { all3Years: { top3Rate: 100, starts: 2 } }
    }
  }) < 60
);

// 精算：100円×点数、的中時は100円あたり払戻
const settled = ab.settle(["1-2-3", "1-2-4"], {
  combination: "1-2-4",
  payout: 1520
});
assert.deepEqual(settled, { cost: 200, returned: 1520, hit: true });

// 1着軸・2着/3着候補が欠けたレースは比較から外す
assert.equal(
  shadow.evaluateRace({ ...basis, raceScenarios: { headBoatNo: 0 } }),
  null
);

console.log("hold-pickup-data-shadow tests passed");
