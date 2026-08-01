"use strict";

const assert = require("assert");
const likelihood = require("../js/scenario-likelihood-v5");

const clearRace = likelihood.analyze([
  { key: "inEscape", label: "1逃げ", score: 88 },
  { key: "course2Sashi", label: "2差し", score: 64 },
  { key: "course3Attack", label: "3攻め", score: 57 },
  { key: "course4Kado", label: "4カド", score: 51 }
]);

assert.strictEqual(clearRace.status, "shadow-only");
assert.strictEqual(clearRace.leader.key, "inEscape");
assert.strictEqual(clearRace.usableForPurchase, false);
assert.strictEqual(clearRace.scenarios.length, 4);
assert.strictEqual(
  Math.round(clearRace.scenarios.reduce((sum, row) => sum + row.relativeLikelihood, 0)),
  100
);
assert.ok(clearRace.likelihoodGap > 0);

const mixedRace = likelihood.analyze([
  { key: "inEscape", score: 76 },
  { key: "course2Sashi", score: 75 },
  { key: "course3Attack", score: 72 },
  { key: "course4Kado", score: 70 }
]);

assert.strictEqual(mixedRace.ambiguity, "mixed");
assert.strictEqual(mixedRace.leader.key, "inEscape");
assert.strictEqual(mixedRace.runnerUp.key, "course2Sashi");

const missing = likelihood.analyze([]);
assert.strictEqual(missing.status, "insufficient-data");
assert.deepStrictEqual(missing.scenarios, []);

const objectInput = likelihood.analyze({
  scenarios: [
    { type: "course3Attack", title: "3攻め", confidence: 82 },
    { type: "inEscape", title: "1逃げ", confidence: 68 }
  ]
});
assert.strictEqual(objectInput.leader.key, "course3Attack");
assert.strictEqual(objectInput.leader.label, "3攻め");

console.log("scenario likelihood v5 shadow tests passed");
