"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const skipAi = require("../js/skip-ai-shadow");
const scenarioAi = require("../js/scenario-ai-v6-shadow");

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

const displaySource = fs.readFileSync("js/skip-ai-display.js", "utf8");
const window = {
  ChappyScenarioAiV6Shadow: scenarioAi,
  ChappySkipAiShadow: skipAi
};
vm.runInNewContext(displaySource, { window, console });
const display = window.ChappySkipAiDisplay;

assert.equal(display.completenessOf({ dataQuality: { score: 100 } }), 100);
assert.equal(display.completenessOf({ evidenceCompleteness: 72, dataQuality: { score: 100 } }), 100);
assert.equal(display.completenessOf({ evidenceCompleteness: 72 }), 72);
assert.equal(display.completenessOf({ evidenceCompleteness: null, dataQuality: { score: 100 } }), 100);
assert.equal(display.completenessOf({ evidenceCompleteness: "", dataQuality: { score: 100 } }), 100);

const completePrediction = {
  selectionScore: 78,
  dataQuality: { score: 100 },
  verificationEvidence: {
    mainScenario: { type: "threeAttack", label: "3コース攻め", headBoatNo: 3, attackerBoatNo: 3 },
    tickets: [{ ticket: "3-1-5", categories: ["本線"] }]
  },
  aiCore: {
    raceScenarios: {
      scenarios: [
        { type: "threeAttack", label: "3コース攻め", score: 65, attacker: 3 },
        { type: "escape", label: "1号艇逃げ", score: 20, attacker: 1 },
        { type: "sashi", label: "2コース差し", score: 15, attacker: 2 }
      ]
    }
  }
};
const completeDecision = display.buildDecision(completePrediction);
assert.equal(completePrediction.scenarioAiV6Shadow.scenarios.length, 3);
assert.equal(completeDecision.reasons.includes("展開シナリオの比較材料が不足"), false);
assert.equal(completeDecision.reasons.includes("展示・STなどの判断材料が不足"), false);

console.log("見送りAIシャドー判定テスト成功");
