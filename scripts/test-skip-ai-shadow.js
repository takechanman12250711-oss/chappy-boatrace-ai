"use strict";

const assert = require("node:assert/strict");
const skipAi = require("../js/skip-ai-shadow");

const stable = skipAi.build({
  selectionScore: 78,
  evidenceCompleteness: 90,
  scenarioAiV6Shadow: { scenarios: [{ likelihood: 62 }, { likelihood: 22 }, { likelihood: 16 }] }
});
assert.equal(stable.decision, "bet-candidate");
assert.equal(stable.riskScore, 0);

const close = skipAi.build({
  selectionScore: 58,
  evidenceCompleteness: 90,
  scenarioAiV6Shadow: { scenarios: [{ likelihood: 39 }, { likelihood: 36 }, { likelihood: 25 }] }
});
assert.equal(close.decision, "skip");
assert.ok(close.reasons.includes("上位展開シナリオが拮抗"));

const missing = skipAi.build({
  selectionScore: 70,
  evidenceCompleteness: 50,
  scenarioAiV6Shadow: { scenarios: [] }
});
assert.equal(missing.decision, "skip");
assert.equal(missing.usableForPrediction, false);
assert.equal(missing.automaticApplication, false);
assert.equal(missing.affectsTickets, false);

console.log("見送りAIシャドー判定テスト成功");
