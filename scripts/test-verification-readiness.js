"use strict";

const assert = require("node:assert/strict");
const {
  MILESTONES,
  getSampleStage,
  findScoreBand,
  buildScoreBands
} = require("../js/verification-readiness");

assert.deepEqual(MILESTONES, [30, 50, 100]);
assert.equal(getSampleStage(0).label, "蓄積中");
assert.equal(getSampleStage(29).remaining, 1);
assert.equal(getSampleStage(30).label, "初期比較");
assert.equal(getSampleStage(50).label, "傾向確認");
assert.equal(getSampleStage(99).referenceOnly, true);
assert.equal(getSampleStage(100).label, "改善検討可能");
assert.equal(getSampleStage(100).stable, true);

assert.equal(findScoreBand(82).key, "80_plus");
assert.equal(findScoreBand(70).key, "70_79");
assert.equal(findScoreBand(69.9).key, "60_69");
assert.equal(findScoreBand(50).key, "50_59");
assert.equal(findScoreBand(49.9).key, "under_50");
assert.equal(findScoreBand(null), null);
assert.equal(findScoreBand(undefined), null);

const bands = buildScoreBands([
  { automaticScore: 81 },
  { automaticScore: 72 },
  { automaticScore: 65 },
  { automaticScore: 55 },
  { automaticScore: 44 }
]);

assert.deepEqual(bands.map(item => item.rows.length), [1, 1, 1, 1, 1]);
assert.ok(bands.every(item => item.readiness.referenceOnly));

console.log("検証件数・点数帯テスト: 合格");
