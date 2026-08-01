"use strict";

const assert = require("assert");
const verification = require("../js/scenario-likelihood-v5-verification");

const shadow = {
  scenarios: [
    { key: "inEscape", relativeLikelihood: 45 },
    { key: "course2Sashi", relativeLikelihood: 30 },
    { key: "course3Attack", relativeLikelihood: 15 },
    { key: "course4Kado", relativeLikelihood: 10 }
  ],
  leader: { key: "inEscape", label: "1逃げ", relativeLikelihood: 45 },
  runnerUp: { key: "course2Sashi", label: "2差し", relativeLikelihood: 30 },
  likelihoodGap: 15,
  ambiguity: "lean"
};

const escape = verification.verify(shadow, {
  trifecta: { combination: "1-2-3" },
  winningMethod: "逃げ"
});
assert.strictEqual(escape.comparable, true);
assert.strictEqual(escape.leaderHit, true);
assert.strictEqual(escape.top2Hit, true);

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

console.log("scenario likelihood v5 verification tests passed");
