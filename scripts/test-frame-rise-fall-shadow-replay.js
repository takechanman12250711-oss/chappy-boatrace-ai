"use strict";

const assert = require("node:assert/strict");

global.window = global;
require("../js/ai-core");
const selector = require("../js/practical-selection");
const replay = require("../js/frame-rise-fall-shadow-replay");

const aiCore = global.ChappyAICore;

function boat(boatNo, options = {}) {
  return {
    boatNo,
    playerName: `${boatNo}号艇`,
    indexes: {
      total: options.total ?? 65,
      st: options.st ?? 60,
      exhibition: options.exhibition ?? 60,
      raceFlow: options.raceFlow ?? 65,
      local: options.local ?? 60
    },
    roleScores: {
      attack: options.attack ?? 60,
      flow: options.flow ?? 60,
      hold: options.hold ?? 60,
      pickup: options.pickup ?? 60,
      road: options.road ?? 60
    }
  };
}

const analyses = [
  boat(1, { total: 72, hold: 86 }),
  boat(2, { total: 69, hold: 81 }),
  boat(3, { total: 86, st: 88, exhibition: 86, raceFlow: 89, attack: 92, flow: 88, pickup: 74 }),
  boat(4, { total: 67, attack: 68, flow: 66, hold: 67, pickup: 70 }),
  boat(5, { total: 66, local: 82, flow: 84, pickup: 88, road: 80 }),
  boat(6, { total: 62, local: 76, flow: 74, pickup: 83, road: 86 })
];
const data = {
  stadiumCode: "12",
  raceNo: 8,
  entries: analyses.map(row => ({ boat: row.boatNo, racerName: row.playerName, avgSt: 0.15, exhibitionTime: 6.8 }))
};
const aScenarios = aiCore.buildRaceScenarios(analyses, data);
const aMarks = aiCore.buildMarks(analyses, aScenarios);
const aFormations = aiCore.buildFormations(analyses, aScenarios);
const aPrediction = {
  aiCore: { analyses, raceScenarios: aScenarios, marks: aMarks, formations: aFormations },
  mainSheet: {
    honmei: aMarks.honmei,
    taikou: aMarks.taikou,
    ana: aMarks.ana,
    osae: aMarks.osae,
    tickets: aFormations.main,
    coverTickets: aFormations.safety,
    flowTickets: aFormations.flow,
    flowFormations: aFormations.flowFormations
  },
  manshuSheet: { tickets: aFormations.longshot },
  raceFlow: { title: aScenarios.mainScenario.label || aScenarios.mainScenario.type }
};
const aSelection = selector.select(aPrediction);
const alternate = aScenarios.scenarios.find(row => row.type !== aScenarios.mainScenario.type);
assert.ok(alternate, "B用の別展開が必要");
const bScenarios = [...aScenarios.scenarios]
  .map(row => ({ ...row }))
  .sort((left, right) => Number(right.type === alternate.type) - Number(left.type === alternate.type));

const record = {
  prediction: {
    practicalTickets: aSelection.tickets,
    practicalSelection: {
      ...aSelection,
      frameRiseFallReplayBasis: {
        schemaVersion: 1,
        aiCoreVersion: "test-core",
        analyses,
        raceScenarios: aScenarios,
        courseMapping: null,
        raceFlow: aPrediction.raceFlow
      }
    },
    verificationEvidence: { mainScenario: aScenarios.mainScenario }
  }
};
const snapshot = {
  status: "shadow-ready",
  a: { mainScenario: aScenarios.mainScenario, scenarios: aScenarios.scenarios },
  b: { mainScenario: alternate, scenarios: bScenarios }
};
const result = replay.build(record, snapshot, { coreApi: aiCore, selector });
assert.equal(result.status, "replay-ready");
assert.equal(result.productionAUnchanged, true);
assert.equal(result.ticketContractViolations, 0);
assert.notEqual(result.a.decisionFingerprint, result.b.decisionFingerprint, "Bの主展開変更をdecision fingerprintへ反映する");
assert.equal(result.decisionChanged, true);
assert.equal(result.comparableForFixed100, true);
assert.ok(Array.isArray(result.b.practicalTickets));
assert.ok(["selected", "skipped"].includes(result.bSelectionStatus));

const missing = replay.build({ prediction: {} }, snapshot, { coreApi: aiCore, selector });
assert.equal(missing.status, "replay-basis-unavailable");
assert.equal(missing.comparableForFixed100, false);
console.log("frame rise fall downstream replay tests passed");
