// scripts/test-reference-tags.js
"use strict";

const assert = require("node:assert/strict");
const referenceTags = require("../js/reference-tags");

const prediction = {
  entries: [
    { boatNo: 1, exhibitionTime: 6.88, lapTime: 36.42, currentST: 0.12, localWinRate: 6.2 },
    { boatNo: 2, exhibitionTime: 6.95, lapTime: 36.58, currentST: 0.15, localWinRate: 5.4 },
    { boatNo: 3, exhibitionTime: 6.96, lapTime: 36.63, currentST: 0.18, localWinRate: 5.1 },
    { boatNo: 4, exhibitionTime: 7.01, lapTime: 36.70, currentST: 0.19, localWinRate: 4.8 },
    { boatNo: 5, exhibitionTime: 7.02, lapTime: 36.75, currentST: 0.20, localWinRate: 4.5 },
    { boatNo: 6, exhibitionTime: 7.04, lapTime: 36.81, currentST: 0.22, localWinRate: 4.2 }
  ],
  weather: {
    windDirection: "向かい風",
    windSpeed: 6,
    waveHeight: 7
  },
  engineMode: "新エンジン",
  combinedOdds: {
    categories: {
      main: {
        isFormal: true,
        combinedOdds: 8.4,
        availableCount: 3,
        totalCount: 3
      }
    }
  }
};

const tags = referenceTags.build(prediction);
const keys = tags.map(item => item.key);

assert.ok(keys.includes("exhibition"));
assert.ok(keys.includes("lap"));
assert.ok(keys.includes("start"));
assert.ok(keys.includes("local"));
assert.ok(keys.includes("wind"));
assert.ok(keys.includes("wave"));
assert.ok(keys.includes("new-engine"));
assert.ok(keys.includes("combined-odds"));
assert.equal(keys.includes("hiyori-source"), false);
assert.ok(tags.every(item => item.strength >= 1 && item.strength <= 3));
assert.match(referenceTags.render(tags), /参考情報/);
assert.match(referenceTags.render(tags), /予想の主判断ではなく補足/);

const empty = referenceTags.build({ entries: [] });
assert.deepEqual(empty, []);

console.log("参考情報タグの生成テストに合格しました");
