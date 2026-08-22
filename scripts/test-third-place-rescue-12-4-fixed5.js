"use strict";
const assert = require("node:assert/strict");
global.window = global;
function basePrediction() {
  return {
    analyses: [
      { boatNo: 1, indexes: { st: 0, raceFlow: 80 }, roleScores: { attack: 2, hold: 80, pickup: 60 } },
      { boatNo: 2, indexes: { st: 0, raceFlow: 70 }, roleScores: { attack: 2, hold: 70, pickup: 62 } },
      { boatNo: 3, indexes: { st: 0, raceFlow: 60 }, roleScores: { attack: 1, hold: 60, pickup: 60 } },
      { boatNo: 4, indexes: { st: 1, raceFlow: 65 }, roleScores: { attack: 3, hold: 66, pickup: 63 } },
      { boatNo: 5, indexes: { st: 0, raceFlow: 55 }, roleScores: { attack: 1, hold: 55, pickup: 55 } },
      { boatNo: 6, indexes: { st: 0, raceFlow: 54 }, roleScores: { attack: 1, hold: 54, pickup: 54 } }
    ],
    formations: {
      main: ["1-2-3", "1-3-2", "1-4-3"],
      safety: ["2-1-3", "1-5-2"]
    }
  };
}
global.ChappyAICore = Object.freeze({ buildPredictionData: () => basePrediction() });
require("../js/third-place-rescue-12-4-fixed5");
const out = global.ChappyAICore.buildPredictionData({});
assert.equal(out.formations.thirdPlaceRescue124Fixed5.applied, true);
assert.equal(out.formations.thirdPlaceRescue124Fixed5.rule, "fiveOf5_replace_1-2-3");
assert.equal(out.formations.main[0], "1-2-4");
assert.equal(out.formations.main.length, 3);
assert.equal(out.formations.safety.length, 2);

const weak = basePrediction();
weak.analyses.find(x => x.boatNo === 4).roleScores.pickup = 60;
assert.equal(global.ChappyThirdPlaceRescue124Fixed5.apply(weak), weak);

const duplicate = basePrediction();
duplicate.formations.safety[0] = "1-2-4";
assert.equal(global.ChappyThirdPlaceRescue124Fixed5.apply(duplicate), duplicate);

const absent = basePrediction();
absent.formations.main[0] = "1-2-5";
assert.equal(global.ChappyThirdPlaceRescue124Fixed5.apply(absent), absent);
console.log("third-place 1-2-4 rescue fixed5 tests passed");
