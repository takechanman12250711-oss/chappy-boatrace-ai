"use strict";

const assert = require("assert");
const verification = require("../js/scenario-likelihood-v5-verification");

const shadow = {
  scenarios: [
    { key: "escape", relativeLikelihood: 45 },
    { key: "sashi", relativeLikelihood: 30 },
    { key: "threeAttack", relativeLikelihood: 15 },
    { key: "fourAttack", relativeLikelihood: 10 }
  ],
  leader: { key: "escape", label: "1逃げ", relativeLikelihood: 45 },
  runnerUp: { key: "sashi", label: "2差し", relativeLikelihood: 30 },
  likelihoodGap: 15,
  ambiguity: "lean"
};

const escape = verification.verify(shadow, {
  resultTicket: "1-2-3",
  winningMethod: "逃げ"
});
assert.strictEqual(escape.comparable, true);
assert.strictEqual(escape.leaderHit, true);
assert.strictEqual(escape.top2Hit, true);
assert.strictEqual(escape.actualRelativeLikelihood, 45);
assert.strictEqual(escape.predictedLeader.key, "inEscape");

const sashi = verification.verify(shadow, {
  trifecta: { combination: "2-1-3" },
  winningMethod: "差し"
});
assert.strictEqual(sashi.leaderHit, false);
assert.strictEqual(sashi.top2Hit, true);

const unknown = verification.verify(shadow, {
  trifecta: { combination: "5-1-2" },
  winningMethod: "まくり差し"
});
assert.strictEqual(unknown.comparable, false);

const summary = verification.buildSummary([escape, sashi, unknown]);
assert.strictEqual(summary.comparableCount, 2);
assert.strictEqual(summary.leaderHits, 1);
assert.strictEqual(summary.top2Hits, 2);
assert.strictEqual(summary.byAmbiguity.lean.count, 2);

const keyAliases = {
  escape: "inEscape",
  oneEscape: "inEscape",
  escape_1: "inEscape",
  sashi: "course2Sashi",
  twoSashi: "course2Sashi",
  sashi_2: "course2Sashi",
  threeAttack: "course3Attack",
  attack_3: "course3Attack",
  fourAttack: "course4Kado",
  attack_4: "course4Kado"
};
Object.entries(keyAliases).forEach(([input, expected]) => {
  assert.strictEqual(
    verification.canonicalScenarioKey(input),
    expected
  );
});
verification.SCENARIO_KEYS.forEach(key => {
  assert.strictEqual(verification.canonicalScenarioKey(key), key);
});

const missingActualRow = verification.verify({
  scenarios: shadow.scenarios.filter(row => row.key !== "sashi"),
  leader: shadow.leader,
  runnerUp: shadow.runnerUp,
  ambiguity: "lean"
}, {
  trifecta: { combination: "2-1-3" },
  winningMethod: "差し"
});
assert.strictEqual(missingActualRow.comparable, false);

const extraScenario = verification.verify({
  ...shadow,
  scenarios: [
    ...shadow.scenarios,
    { key: "canonical-evaluated-scenario", relativeLikelihood: 5 }
  ]
}, {
  resultTicket: "1-2-3",
  winningMethod: "逃げ"
});
assert.strictEqual(extraScenario.comparable, false);

const unknownLeader = verification.verify({
  ...shadow,
  leader: {
    key: "canonical-evaluated-scenario",
    relativeLikelihood: 45
  }
}, {
  resultTicket: "1-2-3",
  winningMethod: "逃げ"
});
assert.strictEqual(unknownLeader.comparable, false);

console.log("scenario likelihood v5 verification tests passed");
