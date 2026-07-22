"use strict";

const assert = require("node:assert/strict");
const conditions = require("../js/prediction-conditions");

const snapshot = conditions.capture({
  entries: Array.from({ length: 6 }, (_, index) => ({
    boat: index + 1,
    racerName: `選手${index + 1}`,
    className: index === 2 ? "A1" : "B1",
    avgSt: 0.14 + index * 0.01,
    nationalWinRate: 5 + index * 0.2,
    localWinRate: 4.8 + index * 0.2,
    motor2Rate: 30 + index
  })),
  beforeInfo: Array.from({ length: 6 }, (_, index) => ({
    boat: index + 1,
    exhibition: { displayTime: 6.7 + index * 0.02 }
  })),
  startExhibition: Array.from({ length: 6 }, (_, index) => ({
    boat: index + 1,
    course: index + 1,
    st: 0.1 + index * 0.01
  })),
  weather: {
    windSpeed: 4,
    waveHeight: 3,
    windDirection: "北"
  }
}, {
  venue: { tideInfluence: 70 }
});

assert.equal(snapshot.sourceTiming, "pre_deadline");
assert.equal(snapshot.officialResultUsed, false);
assert.equal(snapshot.boats.length, 6);
assert.equal(snapshot.boats[2].className, "A1");
assert.equal(snapshot.boats[0].exhibitionST, 0.1);
assert.equal(snapshot.boats[0].exhibitionTime, 6.7);
assert.equal(snapshot.weather.windSpeed, 4);
assert.equal(snapshot.weather.venueTideInfluence, 70);
assert.equal(snapshot.dataAvailability.exhibitionST, 6);
assert.deepEqual(conditions.PRIORITY_STAGES, [
  "展開", "コース", "ST・スリット", "展示・足",
  "残し・拾い", "当地・水面", "技量", "モーター"
]);

console.log("予想時点条件スナップショットテスト: 合格");
