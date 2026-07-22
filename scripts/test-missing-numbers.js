"use strict";

const assert = require("node:assert/strict");

const {
  MIN_SAMPLES,
  createAllTrifectas,
  buildMissingNumbers
} = require("../api/missing.js");

const allTickets = createAllTrifectas();

assert.equal(
  allTickets.length,
  120,
  "3連単は120通り"
);

assert.equal(
  new Set(allTickets).size,
  120,
  "3連単に重複がない"
);

const stats = {
  trifectaByVenueRace: {
    "24": {
      "1": {
        totalRaces: 45,
        reliability: "medium",
        counts: {
          "1-2-3": 12,
          "2-1-3": 3
        }
      },
      "2": {
        totalRaces:
          MIN_SAMPLES - 1,
        reliability: "low",
        counts: {}
      }
    }
  }
};

const available =
  buildMissingNumbers(
    stats,
    "24",
    1
  );

assert.equal(available.available, true);
assert.equal(available.sampleSize, 45);
assert.equal(
  available.missingNumbers.length,
  118
);
assert.equal(
  available.missingNumbers.some(
    item => item.ticket === "1-2-3"
  ),
  false
);
assert.equal(
  available.missingNumbers.every(
    item =>
      item.occurrences === 0 &&
      item.sampleSize === 45
  ),
  true
);

const insufficient =
  buildMissingNumbers(
    stats,
    "24",
    2
  );

assert.equal(
  insufficient.available,
  false
);
assert.deepEqual(
  insufficient.missingNumbers,
  []
);

console.log(
  "出てない目集計テストに合格しました"
);
