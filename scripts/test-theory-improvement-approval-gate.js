"use strict";

const assert = require("assert");
const gate = require("../js/theory-improvement-approval-gate");

function records({ theoryKey, jcd, firstHit, secondHit, firstScenario, secondScenario, payout }) {
  const rows = [];
  for (let i = 0; i < 60; i += 1) {
    const first = i < 30;
    const hit = first ? i < firstHit : (i - 30) < secondHit;
    const scenarioHit = first ? i < firstScenario : (i - 30) < secondScenario;
    rows.push({
      raceKey: `202601${String(i + 1).padStart(2, "0")}-${jcd}-1`,
      jcd,
      place: jcd,
      theoryTagSnapshot: {
        theories: [{ theoryKey, label: theoryKey, tickets: ["1-2-3"], mainTicketCount: 1 }]
      },
      result: {
        settled: true,
        resultTicket: hit ? "1-2-3" : "1-3-2",
        payout: hit ? payout : 0,
        verification: { scenarioHit }
      }
    });
  }
  return rows;
}

const stableRaise = gate.build(records({
  theoryKey: "wall",
  jcd: "20",
  firstHit: 12,
  secondHit: 12,
  firstScenario: 20,
  secondScenario: 19,
  payout: 300
}));
assert.ok(stableRaise.approvedCandidates.some(row => row.scope === "theory" && row.action === "raise"));
assert.ok(stableRaise.approvedCandidates.some(row => row.scope === "venue-theory" && row.action === "raise"));
assert.strictEqual(stableRaise.usableForPrediction, false);
assert.strictEqual(stableRaise.automaticApplication, false);

const unstable = gate.build(records({
  theoryKey: "engine",
  jcd: "05",
  firstHit: 12,
  secondHit: 2,
  firstScenario: 20,
  secondScenario: 8,
  payout: 300
}));
assert.strictEqual(unstable.approvedCandidateCount, 0);
assert.ok(unstable.byTheory[0].reason.includes("一致しない") || unstable.byTheory[0].reason.includes("許容範囲外"));

const insufficient = gate.build(records({
  theoryKey: "pickup",
  jcd: "11",
  firstHit: 8,
  secondHit: 8,
  firstScenario: 18,
  secondScenario: 18,
  payout: 300
}).slice(0, 20));
assert.strictEqual(insufficient.approvedCandidateCount, 0);
assert.ok(insufficient.byTheory[0].reason.includes("最低25R"));

console.log("theory improvement approval gate tests passed");
