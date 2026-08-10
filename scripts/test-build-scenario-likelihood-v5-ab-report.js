"use strict";

const assert = require("node:assert/strict");
const builder = require("./build-scenario-likelihood-v5-ab-report");

function variant(leaderKey, runnerUpKey) {
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
    leader: rows.find(row => row.key === leaderKey),
    runnerUp: rows.find(row => row.key === runnerUpKey),
    ambiguity: "lean",
    scenarios: rows
  };
}

{
  const record = {
    raceKey: "20260802-20-8",
    date: "20260802",
    jcd: "20",
    place: "若松",
    raceNo: 8,
    scenarioLikelihoodV5Ab: {
      changed: true,
      a: variant("escape", "sashi"),
      b: variant("sashi", "escape")
    },
    result: {
      resultTicket: "2-1-3",
      winningMethod: "差し",
      scenarioLikelihoodV5AbVerification: {
        comparable: true,
        winner: "tie"
      }
    }
  };
  const row = builder.rowFromRecord(record);
  assert.equal(row.raceKey, "20260802-20-8");
  assert.equal(row.jcd, "20");
  assert.equal(row.place, "若松");
  assert.equal(row.winner, "b");
  assert.equal(row.a.leaderHit, false);
  assert.equal(row.b.leaderHit, true);
  assert.ok(row.a.actualLikelihood > 0);
}

{
  assert.equal(builder.rowFromRecord({ result: {} }), null);
  assert.equal(
    builder.rowFromRecord({
      result: {
        resultTicket: "1-2-3",
        winningMethod: "逃げ",
        scenarioLikelihoodV5AbVerification: { comparable: true }
      }
    }),
    null
  );
}

{
  const rows = builder.collectRows();
  assert.ok(rows.length > 0);
  assert.equal(new Set(rows.map(row => row.raceKey)).size, rows.length);
  assert.ok(rows.some(row => row.a.leaderHit));
  assert.ok(rows.some(row => row.b.leaderHit));
  assert.ok(rows.some(row => row.a.actualLikelihood > 0));
  assert.ok(rows.some(row => row.b.actualLikelihood > 0));
}

console.log("scenario likelihood v5 A/B report builder tests passed");
