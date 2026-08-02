"use strict";

const assert = require("node:assert/strict");
const shadowAb = require("../js/scenario-ai-v6-shadow-ab");
const snapshots = require("./build-scenario-ai-v6-snapshots");

const snapshot = {
  scenarios: [
    { rank: 1, scenarioType: "escape", rawScore: 60, likelihood: 60, representativeTicket: "1-2-4" },
    { rank: 2, scenarioType: "sashi", rawScore: 40, likelihood: 40, representativeTicket: "2-1-4" }
  ]
};

const report = {
  approvalGate: {
    approvedCandidates: [
      { approved: true, scope: "scenario-type", key: "sashi", adjustment: 2 },
      { approved: true, scope: "venue-scenario-type", key: "20:sashi", adjustment: 2 }
    ]
  }
};

const result = shadowAb.build(snapshot, report, { jcd: "20" });
assert.equal(result.status, "shadow-ready");
assert.equal(result.b.scenarios.find(row => row.scenarioType === "sashi").adjustment, 4);
assert.equal(result.usableForPrediction, false);
assert.equal(result.automaticApplication, false);
assert.equal(Math.round(result.b.scenarios.reduce((sum, row) => sum + row.likelihood, 0) * 10) / 10, 100);

const noApproval = shadowAb.build(snapshot, { approvalGate: { approvedCandidates: [] } }, { jcd: "20" });
assert.equal(noApproval.changed, false);

const attached = snapshots.attachSnapshots(
  { verificationPredictions: [{ jcd: "20", prediction: { verificationEvidence: {} } }] },
  () => snapshot,
  shadowAb.build,
  report
);
assert.equal(attached.verificationPredictions.length, 1);
assert.ok(attached.verificationPredictions[0].scenarioAiV6ShadowAb);
assert.equal(attached.scenarioAiV6ShadowAb.usableForPrediction, false);
assert.equal(attached.scenarioAiV6ShadowAb.automaticApplication, false);

console.log("展開AI v6シャドーA/Bテスト成功");
