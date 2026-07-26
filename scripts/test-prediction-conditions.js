"use strict";

const assert = require("node:assert/strict");
const conditions = require("../js/prediction-conditions");

const snapshot = conditions.capture({
  entries: Array.from({ length: 6 }, (_, index) => ({
    boat: index + 1,
    // 公式データのboatNoは艇番ではなくボート機材番号。
    // 艇番のboatを優先しないと、1〜6号艇の選手情報が欠落する。
    boatNo: 50 + index,
    racerName: `選手${index + 1}`,
    className: index === 2 ? "A1" : "B1",
    avgSt: 0.14 + index * 0.01,
    nationalWinRate: 5 + index * 0.2,
    localWinRate: 4.8 + index * 0.2,
    motor2Rate: 30 + index,
    motor3Rate: 45 + index,
    boat2Rate: 28 + index,
    currentRace: {
      stList: [0.11 + index * 0.01]
    }
  })),
  beforeInfo: Array.from({ length: 6 }, (_, index) => ({
    boat: index + 1,
    exhibition: { displayTime: 6.7 + index * 0.02 }
  })),
  startExhibition: Array.from({ length: 6 }, (_, index) => ({
    boat: index + 1,
    course: index + 1,
    st: 0.1 + index * 0.01,
    isOfficialCourse: true,
    mappingSource: "official-start-image"
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
assert.equal(snapshot.schemaVersion, 3);
assert.equal(snapshot.officialResultUsed, false);
assert.equal(snapshot.boats.length, 6);
assert.equal(snapshot.dataAvailability.entries, 6);
assert.equal(snapshot.dataAvailability.averageST, 6);
assert.equal(snapshot.dataAvailability.currentST, 6);
assert.equal(snapshot.dataAvailability.officialCourses, 6);
assert.equal(snapshot.dataAvailability.skill, 6);
assert.equal(snapshot.dataAvailability.motor, 6);
assert.equal(snapshot.dataAvailability.windDirection, true);
assert.equal(snapshot.boats[0].racerName, "選手1");
assert.equal(snapshot.boats[2].className, "A1");
assert.equal(snapshot.boats[0].motor2Rate, 30);
assert.equal(snapshot.boats[0].motor3Rate, 45);
assert.equal(snapshot.boats[0].boat2Rate, 28);
assert.equal(
  snapshot.boats[0].courseMappingSource,
  "official-start-image"
);
assert.equal(snapshot.boats[0].exhibitionST, 0.1);
assert.equal(snapshot.boats[0].exhibitionTime, 6.7);
assert.equal(snapshot.weather.windSpeed, 4);
assert.equal(snapshot.weather.venueTideInfluence, 70);
assert.equal(snapshot.weather.tideStatus, "unavailable");
assert.equal(snapshot.weather.liveTideAvailable, false);
assert.equal(
  snapshot.dataAvailability.tide,
  false,
  "場の固定潮傾向を実潮汐の取得済み扱いにしない"
);
assert.equal(snapshot.dataAvailability.exhibitionST, 6);

const boatsAlias = conditions.capture({
  boats: Array.from({ length: 6 }, (_, index) => ({
    boat: index + 1,
    boatNo: 80 + index,
    racerName: `別名選手${index + 1}`,
    className: "B1"
  }))
});
assert.equal(
  boatsAlias.boats[0].racerName,
  "別名選手1",
  "entries以外の艇配列でも艇番を機材番号と取り違えない"
);
assert.deepEqual(conditions.PRIORITY_STAGES, [
  "展開", "コース", "ST・スリット", "展示・足",
  "残し・拾い", "当地・水面", "技量", "モーター"
]);

console.log("予想時点条件スナップショットテスト: 合格");
