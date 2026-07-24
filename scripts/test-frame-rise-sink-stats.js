// scripts/test-frame-rise-sink-stats.js
"use strict";

const assert = require("node:assert/strict");
const {
  createPattern,
  getMovement,
  addRace,
  finalizePattern
} = require("./build-frame-rise-sink-stats");

assert.equal(getMovement(4, 3), "inside");
assert.equal(getMovement(4, 4), "same");
assert.equal(getMovement(4, 5), "outside");

const pattern = createPattern();
const race = {
  resultAvailable: true,
  finishers: [
    { boat: 1, rank: 1 },
    { boat: 6, rank: 2 },
    { boat: 3, rank: 3 },
    { boat: 4, rank: 4 },
    { boat: 2, rank: 5 },
    { boat: 5, rank: 6 }
  ],
  starts: [
    { boat: 1, course: 1 },
    { boat: 2, course: 3 },
    { boat: 3, course: 2 },
    { boat: 4, course: 4 },
    { boat: 5, course: 6 },
    { boat: 6, course: 5 }
  ]
};

assert.equal(addRace(pattern, race), true);
const result = finalizePattern(pattern);

assert.equal(result.raceCount, 1);
assert.equal(result.frames["1"].stayRate, 100);
assert.equal(result.frames["2"].sinkRate, 100);
assert.equal(result.frames["3"].stayRate, 100);
assert.equal(result.frames["6"].riseRate, 100);
assert.equal(result.frames["2"].entryMovement.outside.rate, 100);
assert.equal(result.frames["3"].entryMovement.inside.rate, 100);
assert.equal(result.frames["6"].byCourseMovement.inside.top3Rate, 100);

console.log("枠別浮沈率分析テストに合格しました");
