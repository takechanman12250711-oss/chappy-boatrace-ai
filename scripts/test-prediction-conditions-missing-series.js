"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const modulePath = path.join(ROOT, "js", "prediction-conditions.js");
const source = fs.readFileSync(modulePath, "utf8");
const conditions = require(modulePath);

assert.match(
  source,
  /const source = Array\.isArray\(values\)[\s\S]*?values === null \|\| values === undefined[\s\S]*?\[values\]/,
  "ST平均は欠損・単一値・配列を安全に正規化する"
);
assert.match(
  source,
  /このモジュールは予想ロジック・重み・買い目を変更しない/,
  "条件スナップショットは予想ロジックから分離する"
);

const raceData = {
  source: "boatrace-official",
  entries: [
    {
      boatNo: 1,
      racerName: "1号艇",
      currentRace: {
        stList: [".12", ".14"]
      }
    },
    {
      boatNo: 2,
      racerName: "2号艇",
      currentSeries: {
        st: ".16"
      }
    },
    {
      boatNo: 3,
      racerName: "3号艇",
      currentRace: {
        stList: null,
        starts: undefined
      }
    },
    {
      boatNo: 4,
      racerName: "4号艇"
    },
    {
      boatNo: 5,
      racerName: "5号艇",
      series: {
        startTimings: [
          { st: ".18" },
          { startTime: ".20" }
        ]
      }
    },
    {
      boatNo: 6,
      racerName: "6号艇",
      currentRace: {
        stList: ""
      }
    }
  ]
};

const original = JSON.stringify(raceData);
let snapshot = null;
assert.doesNotThrow(() => {
  snapshot = conditions.capture(raceData, {});
}, "ST節間データが欠損しても条件保存を止めない");

assert.equal(snapshot.boats.length, 6);
assert.equal(snapshot.boats[0].currentST, 0.13);
assert.equal(snapshot.boats[1].currentST, 0.16);
assert.equal(snapshot.boats[2].currentST, null);
assert.equal(snapshot.boats[3].currentST, null);
assert.equal(snapshot.boats[4].currentST, 0.19);
assert.equal(snapshot.boats[5].currentST, null);
assert.equal(snapshot.dataAvailability.currentST, 3);
assert.equal(
  JSON.stringify(raceData),
  original,
  "条件保存は入力レースデータを書き換えない"
);
assert.equal(snapshot.usagePolicy.includes("予想ロジック"), true);

console.log("prediction conditions missing ST series contract passed");
