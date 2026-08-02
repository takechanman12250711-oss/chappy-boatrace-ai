"use strict";
const assert = require("node:assert/strict");
const gate = require("./build-scenario-ai-v6-reproducibility-gate");

function doc(rows) {
  return {
    date: "20260801",
    verificationPredictions: rows.map((row, index) => ({
      raceKey: `20260801-01-${index + 1}`,
      date: row.date || "20260801",
      jcd: row.jcd || "01",
      place: "桐生",
      scenarioAiV6Verification: {
        status: "verified",
        scenarios: [{
          rank: 1,
          scenarioType: row.type || "escape",
          likelihood: 60,
          exact: row.exact,
          firstHit: row.firstHit,
          top2Hit: row.top2Hit,
          winningMethodMatch: row.method,
          breakReasons: row.exact ? [] : ["想定頭が1着ではなかった"]
        }]
      }
    }))
  };
}

const stable = [];
for (let i = 0; i < 60; i += 1) stable.push({ date: `202607${String(1 + Math.floor(i / 2)).padStart(2, "0")}`, exact: i % 4 !== 0, firstHit: i % 5 !== 0, top2Hit: true, method: i % 5 !== 0 });
const report = gate.buildReport([doc(stable)]);
assert.equal(report.usableForPrediction, false);
assert.equal(report.automaticApplication, false);
assert.ok(report.approvalGate.approvedCandidateCount >= 1);

const unstable = [];
for (let i = 0; i < 30; i += 1) unstable.push({ date: `202606${String(i + 1).padStart(2, "0")}`, exact: true, firstHit: true, top2Hit: true, method: true });
for (let i = 0; i < 30; i += 1) unstable.push({ date: `202607${String(i + 1).padStart(2, "0")}`, exact: false, firstHit: false, top2Hit: false, method: false });
const bad = gate.buildReport([doc(unstable)]);
assert.equal(bad.approvalGate.approvedCandidateCount, 0);
assert.ok(bad.evaluations.some(row => row.reasons.includes("前半と後半で方向不一致") || row.reasons.some(reason => reason.includes("ポイント超"))));

const small = gate.buildReport([doc(stable.slice(0, 20))]);
assert.equal(small.approvalGate.approvedCandidateCount, 0);
console.log("scenario AI v6 reproducibility gate tests passed");
