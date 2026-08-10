"use strict";
const assert = require("node:assert/strict");
const gate = require("./build-scenario-ai-v6-reproducibility-gate");
const scenarioAiV6 = require("../js/scenario-ai-v6-shadow");

function doc(rows) {
  return {
    date: "20260801",
    verificationPredictions: rows.map((row, index) => {
      const date = row.date || "20260801";
      const inputSourceKind = row.inputSourceKind || "live-verification-evidence";
      return {
        raceKey: `20260801-01-${index + 1}`,
        date,
        selectedAt: row.selectedAt ||
          `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T00:00:00.000Z`,
        jcd: row.jcd || "01",
        place: "桐生",
        scenarioAiV6Shadow: {
          logicFingerprint: scenarioAiV6.LOGIC_FINGERPRINT,
          inputSourceKind
        },
        scenarioAiV6ShadowAb: {
          candidateSetFingerprint: row.candidateSetFingerprint || "none"
        },
        scenarioAiV6Verification: {
          status: "verified",
          logicFingerprint: scenarioAiV6.LOGIC_FINGERPRINT,
          inputSourceKind,
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
      };
    })
  };
}

const stable = [];
for (let i = 0; i < 60; i += 1) stable.push({ date: `202607${String(1 + Math.floor(i / 2)).padStart(2, "0")}`, exact: i % 4 !== 0, firstHit: i % 5 !== 0, top2Hit: true, method: i % 5 !== 0 });
const report = gate.buildReport([doc(stable)]);
assert.equal(report.usableForPrediction, false);
assert.equal(report.automaticApplication, false);
assert.ok(report.approvalGate.approvedCandidateCount >= 1);
assert.equal(report.trainingCohort.mode, "pre-candidate-only");
assert.equal(report.trainingCohort.raceCount, 60);
assert.equal(report.trainingCohort.scenarioCount, 60);
assert.notEqual(report.trainingCohort.fingerprint, "none");
assert.equal(report.trainingCohort.trainedThrough, "2026-07-30T00:00:00.000Z");

const activeVariantRows = stable.map(row => ({
  ...row,
  exact: false,
  firstHit: false,
  top2Hit: false,
  method: false,
  candidateSetFingerprint: "scenario-type:escape:2"
}));
const isolated = gate.buildReport([doc(stable), doc(activeVariantRows)]);
assert.equal(isolated.evaluatedScenarioCount, report.evaluatedScenarioCount);
assert.equal(isolated.trainingCohort.fingerprint, report.trainingCohort.fingerprint);
assert.deepEqual(
  isolated.approvalGate.approvedCandidates.map(row => [row.scope, row.key, row.adjustment]),
  report.approvalGate.approvedCandidates.map(row => [row.scope, row.key, row.adjustment]),
  "評価中Bの結果で候補セットを継続・撤回しない"
);

const unstable = [];
for (let i = 0; i < 30; i += 1) unstable.push({ date: `202606${String(i + 1).padStart(2, "0")}`, exact: true, firstHit: true, top2Hit: true, method: true });
for (let i = 0; i < 30; i += 1) unstable.push({ date: `202607${String(i + 1).padStart(2, "0")}`, exact: false, firstHit: false, top2Hit: false, method: false });
const bad = gate.buildReport([doc(unstable)]);
assert.equal(bad.approvalGate.approvedCandidateCount, 0);
assert.ok(bad.evaluations.some(row => row.reasons.includes("前半と後半で方向不一致") || row.reasons.some(reason => reason.includes("ポイント超"))));

const small = gate.buildReport([doc(stable.slice(0, 20))]);
assert.equal(small.approvalGate.approvedCandidateCount, 0);
console.log("scenario AI v6 reproducibility gate tests passed");
