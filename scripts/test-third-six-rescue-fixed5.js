"use strict";
const assert = require("node:assert/strict");
global.window = global;
global.ChappyAICore = Object.freeze({
  buildPredictionData() {
    return {
      analyses: [
        { boatNo: 1, indexes: { raceFlow: 80 }, roleScores: { pickup: 60, hold: 80 } },
        { boatNo: 2, indexes: { raceFlow: 70 }, roleScores: { pickup: 60, hold: 70 } },
        { boatNo: 3, indexes: { raceFlow: 70 }, roleScores: { pickup: 60, hold: 70 } },
        { boatNo: 4, indexes: { raceFlow: 70 }, roleScores: { pickup: 60, hold: 70 } },
        { boatNo: 5, indexes: { raceFlow: 70 }, roleScores: { pickup: 60, hold: 70 } },
        { boatNo: 6, indexes: { raceFlow: 60 }, roleScores: { pickup: 70, hold: 30 } }
      ],
      formations: {
        main: ["1-2-3", "1-2-4", "1-3-2"],
        safety: ["2-1-3", "2-1-4"]
      }
    };
  }
});
require("../js/third-six-rescue-fixed5");
const out = global.ChappyAICore.buildPredictionData({});
assert.deepEqual(out.formations.main, ["1-2-3", "1-2-4", "1-3-2"]);
assert.deepEqual(out.formations.safety, ["2-1-3", "1-2-6"]);
assert.equal(out.formations.thirdSixRescueFixed5.applied, true);
assert.equal(out.formations.thirdSixRescueFixed5.ticket, "1-2-6");

const unchanged = global.ChappyThirdSixRescueFixed5.apply({
  analyses: [{ boatNo: 6, indexes: { raceFlow: 59 }, roleScores: { pickup: 70, hold: 30 } }],
  formations: { main: ["1-2-3", "1-2-4", "1-3-2"], safety: ["2-1-3", "2-1-4"] }
});
assert.deepEqual(unchanged.formations.safety, ["2-1-3", "2-1-4"]);
console.log("third-six rescue fixed5 tests passed");
