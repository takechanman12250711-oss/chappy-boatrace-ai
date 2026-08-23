"use strict";

const assert = require("node:assert/strict");
global.window = global;
require("../js/boat-identity");
const theoryInput = require("../js/theory-input");
const stats = require("../data/stats/racer-skill-patterns.json");

const registerNo = Object.keys(stats.racers || {})
  .find(key => stats.racers?.[key]?.windows?.all3Years?.byCourse);
assert.ok(registerNo, "コース別ST履歴を持つ選手が必要");

const skillHistory = stats.racers[registerNo];
const data = {
  stadiumCode: "12",
  entries: Array.from({ length: 6 }, (_, index) => ({
    boat: index + 1,
    boatNo: index + 1,
    registerNo: index === 0 ? registerNo : String(9000 + index),
    racerName: `艇${index + 1}`,
    avgSt: 0.15
  })),
  startExhibition: Array.from({ length: 6 }, (_, index) => ({
    boat: index + 1,
    course: index + 1,
    st: 0.12 + index * 0.01,
    isOfficialCourse: true,
    mappingSource: "official-start-image"
  })),
  historyContext: {
    ready: true,
    racers: [{
      registerNo,
      currentVenueStarts: 12
    }]
  }
};

const normalized = theoryInput.normalize(data);
const boat1 = normalized.entries.find(row => Number(row.boatNo) === 1);
const historyBoat1 = normalized.historyContext.racers.find(
  row => String(row.registerNo) === registerNo
);
assert.ok(boat1);
assert.ok(historyBoat1);
assert.deepEqual(
  boat1.skillHistory,
  skillHistory,
  "Node自動予想ではentryへローカルST正本を補完する"
);
assert.deepEqual(
  historyBoat1.skillHistory,
  skillHistory,
  "ST本体が参照するhistoryContext.racersにも同じ履歴を補完する"
);
assert.equal(boat1.localStarts, 12);
assert.equal(
  theoryInput.normalize(normalized),
  normalized,
  "同一VERSIONの再正規化は冪等"
);

console.log("theory-input ST history fallback test: ok");