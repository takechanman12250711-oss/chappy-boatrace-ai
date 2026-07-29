"use strict";

const assert = require("node:assert/strict");

global.window = global;
global.window.addEventListener =
  () => {};
global.document = {
  addEventListener() {}
};

require("../js/stats");

const buildDisplay =
  global.ChappyStats
    .buildObservedRateDisplay;

assert.deepEqual(
  buildDisplay(5, 4),
  {
    ready: false,
    sampleSize: 5,
    hitCount: 4,
    rate: null,
    message:
      "新方式データ蓄積中：5/30件"
  },
  "全体が30件でも、5件しかない役割・区分の率は表示しない"
);
assert.equal(
  buildDisplay(29, 20).rate,
  null,
  "個別母数30件未満は率を非表示にする"
);
assert.deepEqual(
  buildDisplay(30, 12),
  {
    ready: true,
    sampleSize: 30,
    hitCount: 12,
    rate: 40,
    message: "12/30件"
  },
  "個別母数30件から事後実績率を表示する"
);
assert.deepEqual(
  buildDisplay(30, 99),
  {
    ready: true,
    sampleSize: 30,
    hitCount: 30,
    rate: 100,
    message: "30/30件"
  },
  "的中数を母数以内へ正規化する"
);

console.log(
  "新方式統計の母数ゲートテスト: 合格"
);
