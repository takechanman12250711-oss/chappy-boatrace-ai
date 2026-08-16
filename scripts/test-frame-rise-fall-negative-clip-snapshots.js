"use strict";

const assert = require("node:assert/strict");
const builder = require("./build-frame-rise-fall-negative-clip-snapshots");
const trial = require("../config/frame-rise-fall-negative-clip-trial.json");

function record(selectedAt) {
  return {
    raceKey: "20260816-19-10",
    date: "20260816",
    jcd: "19",
    raceNo: 10,
    selectedAt,
    prediction: {
      practicalTickets: ["1-2-3"],
      verificationEvidence: {
        mainScenario: { type: "fourAttack", attackerBoatNo: 4, score: 70, frameMovementAdjustment: -3 },
        scenarios: [
          { type: "fourAttack", attackerBoatNo: 4, score: 70, frameMovementAdjustment: -3 },
          { type: "escape", headBoatNo: 1, score: 72, frameMovementAdjustment: 2 }
        ],
        frameMovement: [
          { boatNo: 4, appliedToScore: true, scoreAdjustment: -3, movementDelta: -9, label: "沈下" },
          { boatNo: 1, appliedToScore: true, scoreAdjustment: 2, movementDelta: 3, label: "維持" }
        ]
      },
      practicalSelection: {
        status: "selected",
        tickets: ["1-2-3"],
        frameRiseFallReplayBasis: {
          aiCoreVersion: "test",
          analyses: [{ boatNo: 1 }, { boatNo: 2 }, { boatNo: 3 }, { boatNo: 4 }, { boatNo: 5 }, { boatNo: 6 }],
          raceScenarios: {
            mainScenario: { type: "fourAttack", attackerBoatNo: 4, score: 70 },
            scenarios: [
              { type: "fourAttack", attackerBoatNo: 4, score: 70 },
              { type: "escape", headBoatNo: 1, score: 72 }
            ]
          },
          courseMapping: null,
          raceFlow: {}
        }
      }
    }
  };
}

const dependencies = {
  coreApi: {
    buildMarks() { return { honmei: 1, taikou: 4, ana: 2, osae: 3 }; },
    buildFormations() {
      return { main: ["4-1-2"], safety: [], flow: [], flowFormations: [], longshot: [] };
    }
  },
  selector: {
    select() { return { status: "selected", tickets: ["4-1-2"] }; }
  }
};

const cutoffMs = Date.parse(trial.cutoff.selectedAtExclusiveLowerBound);
const before = builder.buildSnapshot(record(new Date(cutoffMs).toISOString()), dependencies);
assert.equal(before.status, "before-or-at-cutoff");

const after = builder.buildSnapshot(record(new Date(cutoffMs + 60000).toISOString()), dependencies);
assert.equal(after.candidateId, "frame-rise-fall-negative-clip-v1");
assert.equal(after.status, "shadow-ready");
assert.equal(after.comparisonContract.comparableForFixed100, true);
assert.equal(after.downstreamReplay.a.practicalTickets[0], "1-2-3");
assert.equal(after.downstreamReplay.b.practicalTickets[0], "4-1-2");
assert.equal(after.productionAUnchanged, true);
assert.equal(after.productionPredictionChanged, false);
assert.equal(after.productionTicketSelectionChanged, false);
assert.equal(after.usableForPrediction, false);
assert.equal(after.automaticApplication, false);

const attached = builder.attach({ verificationPredictions: [record(new Date(cutoffMs + 60000).toISOString())] }, dependencies);
assert.equal(attached.frameRiseFallNegativeClipShadowAb.capturedCount, 1);
assert.equal(attached.frameRiseFallNegativeClipShadowAb.comparableCount, 1);
assert.equal(attached.verificationPredictions[0].frameRiseFallNegativeClipShadowAb.candidateId, trial.candidateId);

console.log("frame rise/fall negative clip prospective snapshot test: ok");
