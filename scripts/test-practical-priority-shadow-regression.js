"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

global.window = global;
require("../js/boat-identity");
require("../js/ai-core");
require("../js/prediction");
const selector = require("../js/practical-selection");
const priorityShadow = require(
  "../js/practical-priority-shadow"
);

const MAXIMUM_DATE = "20260812";
const DIRECTORY = path.join(
  process.cwd(),
  "data",
  "predictions"
);

function rowsOf(data) {
  return [
    ...(data.predictions || []),
    ...(data.verificationPredictions || [])
  ];
}

function ticketOf(value) {
  const numbers = String(
    value?.ticket || value || ""
  ).match(/[1-6]/g) || [];
  return numbers.length >= 3
    ? numbers.slice(0, 3).join("-")
    : "";
}

function predictionInput(row) {
  const frozen =
    row?.prediction?.preRaceConditions ||
    row?.preRaceConditions;
  if (
    !frozen ||
    !Array.isArray(frozen.boats) ||
    frozen.boats.length < 5
  ) {
    return null;
  }
  return {
    ...frozen,
    entries: frozen.boats,
    boats: frozen.boats,
    jcd: row.jcd,
    stadiumCode: row.jcd,
    venueCode: row.jcd,
    placeName: row.place,
    venueName: row.place,
    raceNo: row.raceNo,
    rno: row.raceNo,
    weather: frozen.weather || {}
  };
}

function cohortOf(date) {
  if (date < "20260807") return "pre";
  if (date <= "20260810") return "mid";
  if (date === "20260811") return "d0811";
  return "d0812";
}

function emptyStats() {
  return {
    races: 0,
    baseHits: 0,
    shadowHits: 0,
    gains: 0,
    losses: 0,
    changes: 0,
    stake: 0,
    baseReturn: 0,
    shadowReturn: 0
  };
}

function add(stats, sample) {
  stats.races += 1;
  stats.stake += sample.stake;
  if (sample.baseHit) {
    stats.baseHits += 1;
    stats.baseReturn += sample.payout;
  }
  if (sample.shadowHit) {
    stats.shadowHits += 1;
    stats.shadowReturn += sample.payout;
  }
  if (sample.changed) stats.changes += 1;
  if (!sample.baseHit && sample.shadowHit) stats.gains += 1;
  if (sample.baseHit && !sample.shadowHit) stats.losses += 1;
}

const cohorts = {
  pre: emptyStats(),
  mid: emptyStats(),
  d0811: emptyStats(),
  d0812: emptyStats()
};
const seen = new Set();
const addedTickets = {};
const removedCategories = {};

for (const filename of fs.readdirSync(DIRECTORY)
  .filter(name => /^\d{8}\.json$/.test(name))
  .sort()) {
  const date = filename.slice(0, 8);
  if (date > MAXIMUM_DATE) continue;
  const data = JSON.parse(
    fs.readFileSync(path.join(DIRECTORY, filename), "utf8")
  );

  for (const row of rowsOf(data)) {
    if (row?.result?.settled !== true) continue;
    const raceKey =
      row.raceKey || `${date}-${row.jcd}-${row.raceNo}`;
    if (seen.has(raceKey)) continue;
    seen.add(raceKey);
    const actual = ticketOf(
      row?.result?.resultTicket ||
      row?.result?.review?.resultTicket
    );
    const input = predictionInput(row);
    if (!actual || !input) continue;

    const selection = selector.select(
      global.createPrediction(input)
    );
    const before = JSON.stringify(selection);
    const shadow = priorityShadow.build(selection);
    assert.equal(
      JSON.stringify(selection),
      before,
      `${raceKey}: shadow must not mutate selection`
    );
    assert.equal(shadow.automaticApplication, false);
    assert.equal(shadow.usableForPrediction, false);
    assert.equal(shadow.affectsTickets, false);
    assert.equal(
      shadow.baseTickets.length,
      shadow.shadowTickets.length,
      `${raceKey}: fixed ticket count`
    );

    if (shadow.eligible) {
      assert.ok(
        shadow.replacement.addedPriorityScore >
          shadow.replacement.removedPriorityScore,
        `${raceKey}: strict priority improvement`
      );
      assert.ok(
        !["本線", "流し"].includes(
          shadow.replacement.removedCategory
        ),
        `${raceKey}: protected tickets remain`
      );
      addedTickets[shadow.replacement.addedTicket] =
        (addedTickets[shadow.replacement.addedTicket] || 0) + 1;
      removedCategories[shadow.replacement.removedCategory] =
        (removedCategories[shadow.replacement.removedCategory] || 0) + 1;
    }

    const baseHit = shadow.baseTickets.includes(actual);
    const shadowHit = shadow.shadowTickets.includes(actual);
    add(cohorts[cohortOf(date)], {
      baseHit,
      shadowHit,
      changed: shadow.eligible,
      stake: shadow.baseTickets.length * 100,
      payout: Number(
        row?.result?.payoutPer100 ||
        row?.result?.review?.payoutPer100 ||
        0
      )
    });
  }
}

assert.deepEqual(cohorts, {
  pre: {
    races: 457,
    baseHits: 134,
    shadowHits: 135,
    gains: 1,
    losses: 0,
    changes: 39,
    stake: 380200,
    baseReturn: 225710,
    shadowReturn: 232470
  },
  mid: {
    races: 313,
    baseHits: 107,
    shadowHits: 109,
    gains: 2,
    losses: 0,
    changes: 29,
    stake: 264200,
    baseReturn: 198350,
    shadowReturn: 201370
  },
  d0811: {
    races: 97,
    baseHits: 28,
    shadowHits: 29,
    gains: 1,
    losses: 0,
    changes: 8,
    stake: 86300,
    baseReturn: 66650,
    shadowReturn: 68500
  },
  d0812: {
    races: 112,
    baseHits: 31,
    shadowHits: 33,
    gains: 2,
    losses: 0,
    changes: 14,
    stake: 98600,
    baseReturn: 113680,
    shadowReturn: 116180
  }
});
console.log(
  "practical priority current distributions",
  JSON.stringify({ addedTickets, removedCategories })
);
assert.deepEqual(addedTickets, {
  "1-3-6": 54,
  "1-4-2": 25,
  "1-4-6": 3,
  "1-3-2": 2
});
assert.deepEqual(removedCategories, {
  独立展開: 60,
  押さえ: 24
});

const total = Object.values(cohorts).reduce(
  (sum, stats) => {
    Object.keys(sum).forEach(key => {
      sum[key] += stats[key];
    });
    return sum;
  },
  emptyStats()
);
assert.deepEqual(total, {
  races: 979,
  baseHits: 300,
  shadowHits: 306,
  gains: 6,
  losses: 0,
  changes: 90,
  stake: 829300,
  baseReturn: 604390,
  shadowReturn: 618520
});

console.log(
  "practical priority prospective shadow regression: OK",
  JSON.stringify({ cohorts, total })
);
