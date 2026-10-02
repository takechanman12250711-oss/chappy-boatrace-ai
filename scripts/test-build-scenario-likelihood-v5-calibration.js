"use strict";

const assert = require("node:assert/strict");
const builder = require("./build-scenario-likelihood-v5-calibration");

function scenarios(leaderKey, runnerUpKey) {
  const rows = [
    ["escape", "1逃げ", 45],
    ["sashi", "2差し", 30],
    ["threeAttack", "3攻め", 15],
    ["fourAttack", "4カド", 10]
  ].map(([key, label, relativeLikelihood]) => ({
    key,
    label,
    relativeLikelihood
  }));
  return {
    scenarios: rows,
    leader: rows.find(row => row.key === leaderKey),
    runnerUp: rows.find(row => row.key === runnerUpKey),
    ambiguity: "lean"
  };
}

{
  const row = builder.rowsFromRecord({
    raceKey: "20260801-20-8",
    jcd: "20",
    scenarioLikelihoodV5: scenarios("sashi", "escape"),
    result: {
      resultTicket: "2-1-3",
      winningMethod: "差し"
    }
  });
  assert.equal(row.actualScenario, "2差し");
  assert.equal(row.leaderScenario, "2差し");
  assert.equal(row.runnerUpScenario, "1逃げ");
  assert.equal(row.leaderLikelihood, 30);
  assert.equal(row.topTwoHit, true);
}

{
  const row = builder.rowsFromRecord({
    raceKey: "20260801-11-4",
    jcd: "11",
    scenarioLikelihoodV5Ab: {
      changed: false,
      a: scenarios("escape", "threeAttack"),
      b: scenarios("escape", "threeAttack")
    },
    result: {
      resultTicket: "1-2-3",
      winningMethod: "逃げ"
    }
  });
  assert.equal(row.actualScenario, "1逃げ");
  assert.equal(row.leaderScenario, "1逃げ");
  assert.equal(row.leaderLikelihood, 45);
  assert.equal(row.leaderHit, true);
}

assert.equal(builder.rowsFromRecord({ result: {} }), null);

{
  const rows = builder.collectRows();
  assert.ok(rows.length > 0);
  assert.equal(new Set(rows.map(row => row.raceKey)).size, rows.length);
  assert.ok(rows.some(row => row.leaderHit));
  assert.ok(rows.some(row => row.topTwoHit));
}

console.log("scenario likelihood v5 calibration builder tests passed");
