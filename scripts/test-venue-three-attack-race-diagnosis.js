"use strict";

const assert = require("node:assert/strict");
const api = require("../js/venue-three-attack-race-diagnosis");

function record({ raceKey, jcd, place, ticket, practicalTickets, payout, winningMethod = "まくり", claims = [] }) {
  return {
    raceKey,
    date: raceKey.slice(0, 8),
    jcd,
    place,
    raceNo: Number(raceKey.split("-").pop()),
    prediction: {
      practicalTickets: practicalTickets.map(value => ({ ticket: value })),
      verificationEvidence: {
        scenarios: [{ type: "threeAttack", label: "3コース攻め" }],
        theoryClaims: claims
      }
    },
    result: {
      settled: true,
      resultTicket: ticket,
      payout,
      payoutPer100: payout,
      winningMethod,
      verification: { practicalTickets }
    }
  };
}

const records = [
  record({
    raceKey: "20260901-06-1", jcd: "06", place: "浜名湖", ticket: "3-1-4",
    practicalTickets: ["3-1-4", "3-4-1"], payout: 8000,
    claims: [{ theoryKey: "race-flow", label: "展開理論", formal: true }]
  }),
  record({
    raceKey: "20260901-06-2", jcd: "06", place: "浜名湖", ticket: "1-3-2",
    practicalTickets: ["3-1-2", "3-2-1", "1-2-3"], payout: 1200,
    winningMethod: "逃げ",
    claims: [{ theoryKey: "race-flow", label: "展開理論", formal: true }, { theoryKey: "wall-boat", label: "壁艇理論" }]
  }),
  record({
    raceKey: "20260901-16-1", jcd: "16", place: "児島", ticket: "2-3-1",
    practicalTickets: ["3-1-2", "3-2-1"], payout: 3000,
    claims: [{ theoryKey: "course", label: "コース理論", formal: true }]
  }),
  record({
    raceKey: "20260901-20-1", jcd: "20", place: "若松", ticket: "3-2-1",
    practicalTickets: ["3-2-1", "3-1-2"], payout: 2400,
    claims: [{ theoryKey: "race-flow", label: "展開理論", formal: true }]
  }),
  record({
    raceKey: "20260901-20-2", jcd: "20", place: "若松", ticket: "3-1-5",
    practicalTickets: ["3-1-5", "3-5-1"], payout: 1800,
    claims: [{ theoryKey: "race-flow", label: "展開理論", formal: true }]
  }),
  {
    ...record({
      raceKey: "20260901-20-3", jcd: "20", place: "若松", ticket: "1-2-3",
      practicalTickets: ["1-2-3"], payout: 900
    }),
    prediction: { verificationEvidence: { scenarios: [{ type: "escape", label: "1号艇逃げ" }] } }
  }
];

assert.deepEqual(api.finishCoverage("1-3-2", ["3-1-2", "1-2-3"]), {
  positionCovered: [true, false, true],
  prefixCovered: [true, false, false],
  firstDivergence: "SECOND_POSITION"
});

const built = api.build(records, {
  sourceGeneratedAt: "2026-09-20T00:00:00.000Z",
  analysisInputContract: "official-pre-deadline-cohort-v1",
  diagnostics: { settledJoinCount: 5 }
});
assert.equal(built.productionChanged, false);
assert.equal(built.automaticProductionChange, false);
assert.equal(built.usableForPrediction, false);
assert.equal(built.retrospectiveDiagnosisOnly, true);
assert.equal(built.focusVenueCount, 3);
assert.equal(built.raceCount, 5);
assert.equal(built.analysisInputContract, "official-pre-deadline-cohort-v1");

const hamanako = built.venues.find(row => row.jcd === "06");
assert.equal(hamanako.raceCount, 2);
assert.equal(hamanako.hitCount, 1);
assert.equal(hamanako.hitRate, 50);
assert.equal(hamanako.stake, 500);
assert.equal(hamanako.return, 8000);
assert.equal(hamanako.recoveryRate, 1600);
assert.equal(hamanako.payoutDependence.highestHitReturnShare, 100);
assert.equal(hamanako.payoutDependence.recoveryRateWithoutHighestHit, 0);
assert.deepEqual(hamanako.boat3Finish, { first: 1, second: 1, third: 0, outsideTop3: 0 });
assert.equal(hamanako.firstDivergence.find(row => row.key === "HIT").count, 1);
assert.equal(hamanako.firstDivergence.find(row => row.key === "SECOND_POSITION").count, 1);
assert.equal(hamanako.theoryClaims.find(row => row.theoryKey === "race-flow").raceCount, 2);
assert.equal(hamanako.theoryClaims.find(row => row.theoryKey === "race-flow").hitRate, 50);

const kojima = built.venues.find(row => row.jcd === "16");
assert.equal(kojima.hitCount, 0);
assert.equal(kojima.payoutDependence.noHitReturn, true);
assert.equal(kojima.firstDivergence[0].key, "HEAD_POSITION");

const wakamatsu = built.venues.find(row => row.jcd === "20");
assert.equal(wakamatsu.raceCount, 2);
assert.equal(wakamatsu.hitRate, 100);
assert.equal(built.positiveControl.jcd, "20");
assert.equal(built.comparisons.length, 2);
assert.equal(built.comparisons.find(row => row.venue.jcd === "16").deltaVsControl.hitRate, -100);
assert.equal(built.limitations.length, 3);

console.log("venue three-attack race diagnosis tests passed");
