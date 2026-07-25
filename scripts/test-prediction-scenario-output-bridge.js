"use strict";

const assert = require("node:assert/strict");

global.window = global;
global.document = {
  addEventListener() {}
};
global.addEventListener = function () {};

global.createPrediction = function () {
  return {
    mainSheet: {
      honmei: { boatNo: 1 },
      taikou: { boatNo: 2 },
      tickets: ["1-2-3"]
    },
    manshuSheet: { tickets: ["5-1-2"] },
    formation: {
      main: ["1-2-3"],
      cover: ["1-3-2"],
      nagashi: [],
      hole: ["5-1-2"]
    },
    aiCore: {
      raceScenarios: {
        confidence: 88,
        mainScenario: { type: "threeAttack", label: "3コース攻め" }
      },
      marks: {
        honmei: { boatNo: 3 },
        taikou: { boatNo: 1 },
        ana: { boatNo: 5 },
        osae: { boatNo: 2 },
        scenario: "3コース攻め",
        confidence: 88,
        evidence: { source: "raceScenarios" }
      },
      formations: {
        main: ["3-1-5", "3-1-6", "3-2-5"],
        safety: ["1-3-5", "1-3-2"],
        flow: ["3-1-5"],
        longshot: ["5-3-1"],
        axis: { honmei: 3, taikou: 1, ana: 5, osae: 2 },
        mainEstablished: true,
        evidence: { source: "raceScenarios" }
      }
    }
  };
};

require("../js/prediction-scenario-output-bridge");

const result = global.createPrediction({});

assert.equal(result.mainSheet.honmei.boatNo, 3);
assert.equal(result.mainSheet.taikou.boatNo, 1);
assert.equal(result.mainSheet.ana.boatNo, 5);
assert.equal(result.mainSheet.osae.boatNo, 2);
assert.deepEqual(result.mainSheet.tickets, ["3-1-5", "3-1-6", "3-2-5"]);
assert.deepEqual(result.mainSheet.coverTickets, ["1-3-5", "1-3-2"]);
assert.deepEqual(result.mainSheet.flowTickets, ["3-1-5"]);
assert.deepEqual(result.manshuSheet.tickets, ["5-3-1"]);
assert.deepEqual(result.formation.main, ["3-1-5", "3-1-6", "3-2-5"]);
assert.equal(result.formation.axis.honmei, 3);
assert.equal(result.formation.mainEstablished, true);
assert.equal(result.predictionSource, "ai-core-race-scenarios");

console.log("予想シナリオ最終出力接続テスト: 合格");
console.log("- 展開由来の印をmainSheetへ接続");
console.log("- 展開由来の本線・押さえ・流し・万舟をformationへ接続");
