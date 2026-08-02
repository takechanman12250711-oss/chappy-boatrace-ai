"use strict";

const assert = require("node:assert/strict");
const api = require("../js/theory-shadow-ab-verification");

const shadow = {
  b: {
    tickets: [
      { ticket: "1-2-3", adjustmentPoints: 2, changed: true, theories: [{ theoryKey: "wall" }] },
      { ticket: "1-3-2", adjustmentPoints: -2, changed: true, theories: [{ theoryKey: "remain" }] },
      { ticket: "1-4-2", adjustmentPoints: 0, changed: false, theories: [] }
    ]
  }
};

const promoted = api.verify(shadow, "1-2-3");
assert.equal(promoted.comparable, true);
assert.equal(promoted.bWin, true);
assert.equal(promoted.winnerAdjustmentPoints, 2);

const demoted = api.verify(shadow, "1-3-2");
assert.equal(demoted.aWin, true);
assert.equal(demoted.winnerAdjustmentPoints, -2);

const neutral = api.verify(shadow, "1-4-2");
assert.equal(neutral.draw, true);

const missing = api.verify(shadow, "2-1-3");
assert.equal(missing.comparable, false);
assert.equal(missing.verdict, "not-covered");

const summary = api.summarize([promoted, demoted, neutral, missing]);
assert.deepEqual(summary, {
  comparableCount: 3,
  bWins: 1,
  aWins: 1,
  draws: 1,
  bWinRate: 33.3,
  aWinRate: 33.3,
  drawRate: 33.3
});

console.log("theory shadow A/B verification tests passed");
