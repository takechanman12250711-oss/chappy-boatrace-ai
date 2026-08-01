"use strict";

const assert = require("node:assert/strict");
const builder = require("./build-scenario-likelihood-v5-ab-report");

{
  const record = {
    raceKey: "20260802-20-8",
    date: "20260802",
    jcd: "20",
    place: "若松",
    raceNo: 8,
    result: {
      scenarioLikelihoodV5AbVerification: {
        comparable: true,
        changed: true,
        winner: "b",
        actualScenario: "2差し",
        a: { leaderHit: false, topTwoHit: true },
        b: { leaderHit: true, topTwoHit: true }
      }
    }
  };
  const row = builder.rowFromRecord(record);
  assert.equal(row.raceKey, "20260802-20-8");
  assert.equal(row.jcd, "20");
  assert.equal(row.place, "若松");
  assert.equal(row.winner, "b");
}

{
  assert.equal(builder.rowFromRecord({ result: {} }), null);
  assert.equal(
    builder.rowFromRecord({
      result: { scenarioLikelihoodV5AbVerification: { comparable: false } }
    }),
    null
  );
}

console.log("scenario likelihood v5 A/B report builder tests passed");
