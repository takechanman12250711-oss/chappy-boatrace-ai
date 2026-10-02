"use strict";
const assert = require("node:assert/strict");
global.window = global;
function basePrediction() {
  return {
    raceScenarios: { mainScenario: { type: "escape" } },
    analyses: [
      { boatNo: 1, indexes: { st: 0, exhibition: 0, raceFlow: 80 }, roleScores: { attack: 70, hold: 80, pickup: 60 } },
      { boatNo: 2, indexes: { st: 0, exhibition: 0, raceFlow: 72 }, roleScores: { attack: 68, hold: 70, pickup: 61 } },
      { boatNo: 3, indexes: { st: 0, exhibition: 0, raceFlow: 71 }, roleScores: { attack: 67, hold: 69, pickup: 62 } },
      { boatNo: 4, indexes: { st: 0, exhibition: 0, raceFlow: 70 }, roleScores: { attack: 66, hold: 68, pickup: 63 } },
      { boatNo: 5, indexes: { st: 0, exhibition: 0, raceFlow: 58 }, roleScores: { attack: 64, hold: 58, pickup: 66 } },
      { boatNo: 6, indexes: { st: 1, exhibition: 1, raceFlow: 60 }, roleScores: { attack: 66, hold: 60, pickup: 70 } }
    ],
    formations: {
      main: ["1-2-3", "1-3-2", "1-4-2"],
      safety: ["1-2-4", "2-1-3"]
    }
  };
}
global.ChappyAICore = Object.freeze({ buildPredictionData: () => basePrediction() });
require("../js/escape-outer-second-rescue-fixed5");
const out = global.ChappyAICore.buildPredictionData({});
assert.equal(out.formations.escapeOuterSecondRescueFixed5.applied, true);
assert.equal(out.formations.escapeOuterSecondRescueFixed5.rule, "all4of6_replace4");
assert.equal(out.formations.safety[0], "1-6-4");
assert.deepEqual(out.formations.main, ["1-2-3", "1-3-2", "1-4-2"]);
assert.equal(out.formations.safety.length, 2);

const noEscape = basePrediction();
noEscape.raceScenarios.mainScenario.type = "sashi";
assert.equal(global.ChappyEscapeOuterSecondRescueFixed5.apply(noEscape), noEscape);

const weakOuter = basePrediction();
for (const boat of weakOuter.analyses.filter(x => x.boatNo >= 5)) {
  boat.indexes.st = -10;
  boat.indexes.exhibition = -10;
  boat.indexes.raceFlow = 40;
  boat.roleScores.attack = 40;
  boat.roleScores.hold = 40;
  boat.roleScores.pickup = 40;
}
assert.equal(global.ChappyEscapeOuterSecondRescueFixed5.apply(weakOuter), weakOuter);
console.log("escape outer-second rescue fixed5 tests passed");
