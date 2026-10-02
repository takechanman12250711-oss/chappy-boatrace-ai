"use strict";
const assert = require("node:assert/strict");
global.window = global;
function basePrediction() {
  return {
    analyses: [
      { boatNo: 1, indexes: { exhibition: 0, raceFlow: 80 }, roleScores: { hold: 80, pickup: 60 } },
      { boatNo: 2, indexes: { exhibition: -2, raceFlow: 62 }, roleScores: { hold: 62, pickup: 71 } },
      { boatNo: 3, indexes: { exhibition: 0, raceFlow: 70 }, roleScores: { hold: 70, pickup: 60 } },
      { boatNo: 4, indexes: { exhibition: 0, raceFlow: 72 }, roleScores: { hold: 72, pickup: 63 } },
      { boatNo: 5, indexes: { exhibition: -1, raceFlow: 66 }, roleScores: { hold: 65, pickup: 68 } },
      { boatNo: 6, indexes: { exhibition: 1, raceFlow: 75 }, roleScores: { hold: 74, pickup: 66 } }
    ],
    formations: {
      main: ["1-2-3", "1-3-2", "1-4-3"],
      safety: ["1-2-4", "2-1-3"]
    }
  };
}
global.ChappyAICore = Object.freeze({ buildPredictionData: () => basePrediction() });
require("../js/third-place-rescue-14-fixed5");
const out = global.ChappyAICore.buildPredictionData({});
assert.equal(out.formations.thirdPlaceRescue14Fixed5.applied, true);
assert.equal(out.formations.thirdPlaceRescue14Fixed5.rule, "twoOf3_replace_1-4-3");
assert.equal(out.formations.main[2], "1-4-2");
assert.equal(out.formations.main.length, 3);
assert.equal(out.formations.safety.length, 2);

const weak = basePrediction();
for (const boat of weak.analyses.filter(x => [2,5,6].includes(x.boatNo))) {
  boat.indexes.exhibition = 5;
  boat.indexes.raceFlow = 90;
  boat.roleScores.hold = 90;
}
assert.equal(global.ChappyThirdPlaceRescue14Fixed5.apply(weak), weak);

const absent = basePrediction();
absent.formations.main[2] = "1-4-5";
assert.equal(global.ChappyThirdPlaceRescue14Fixed5.apply(absent), absent);
console.log("third-place 1-4 rescue fixed5 tests passed");
