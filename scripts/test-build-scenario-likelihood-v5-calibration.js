"use strict";

const assert = require("node:assert/strict");
const builder = require("./build-scenario-likelihood-v5-calibration");

{
  const row = builder.rowsFromRecord({
    raceKey: "20260801-20-8",
    jcd: "20",
    result: {
      scenarioLikelihoodV5Verification: {
        comparable: true,
        actualScenario: { key: "course2Sashi", label: "2差し" },
        predictedLeader: {
          key: "course2Sashi",
          label: "2差し",
          relativeLikelihood: 47.5
        },
        predictedRunnerUp: {
          key: "inEscape",
          label: "1逃げ",
          relativeLikelihood: 31.2
        },
        ambiguity: "lean",
        leaderHit: true,
        top2Hit: true
      }
    }
  });
  assert.equal(row.actualScenario, "2差し");
  assert.equal(row.leaderScenario, "2差し");
  assert.equal(row.runnerUpScenario, "1逃げ");
  assert.equal(row.leaderLikelihood, 47.5);
  assert.equal(row.topTwoHit, true);
}

{
  const row = builder.rowsFromRecord({
    raceKey: "20260801-11-4",
    jcd: "11",
    scenarioLikelihoodV5Ab: {
      a: {
        leader: {
          key: "inEscape",
          label: "1逃げ",
          relativeLikelihood: 58.4
        },
        runnerUp: {
          key: "course3Attack",
          label: "3攻め",
          relativeLikelihood: 20.1
        },
        ambiguity: "clear"
      }
    },
    result: {
      scenarioLikelihoodV5AbVerification: {
        comparable: true,
        actualScenario: "1逃げ",
        a: {
          leaderScenario: "1逃げ",
          runnerUpScenario: "3攻め",
          leaderHit: true,
          topTwoHit: true,
          ambiguity: "clear"
        }
      }
    }
  });
  assert.equal(row.actualScenario, "1逃げ");
  assert.equal(row.leaderScenario, "1逃げ");
  assert.equal(row.leaderLikelihood, 58.4);
  assert.equal(row.leaderHit, true);
}

assert.equal(builder.rowsFromRecord({ result: {} }), null);
console.log("scenario likelihood v5 calibration builder tests passed");
