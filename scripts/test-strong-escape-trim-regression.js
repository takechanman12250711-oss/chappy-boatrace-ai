"use strict";

const fs = require("node:fs");
const path = require("node:path");

global.window = global;
require("../js/boat-identity");
require("../js/ai-core");
require("../js/prediction");
const selector = require("../js/practical-selection");

const dir = path.join(process.cwd(), "data", "predictions");
const rows = data => [
  ...(data.predictions || []),
  ...(data.verificationPredictions || [])
];
const ticketOf = value => {
  const match = String(value?.ticket || value || "").match(/[1-6]/g) || [];
  return match.length >= 3 ? match.slice(0, 3).join("-") : "";
};
const dataOf = race => {
  const source = race?.prediction?.preRaceConditions || race?.preRaceConditions;
  if (!source || !Array.isArray(source.boats) || source.boats.length < 5) return null;
  return {
    ...source,
    entries: source.boats,
    boats: source.boats,
    jcd: race.jcd,
    stadiumCode: race.jcd,
    venueCode: race.jcd,
    placeName: race.place,
    venueName: race.place,
    raceNo: race.raceNo,
    rno: race.raceNo,
    weather: source.weather || {}
  };
};
const payoutOf = race => Number(
  race?.result?.payout ||
  race?.result?.officialPayoutPer100 ||
  race?.result?.review?.payout ||
  0
);

const all = [];
const seen = new Set();
for (const file of fs.readdirSync(dir).filter(name => /^\d{8}\.json$/.test(name)).sort()) {
  const date = file.slice(0, 8);
  const numericDate = Number(date);
  const data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
  for (const race of rows(data)) {
    if (race?.result?.settled !== true) continue;
    const key = race.raceKey || `${date}-${race.jcd}-${race.raceNo}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const actual = ticketOf(race?.result?.resultTicket || race?.result?.review?.resultTicket);
    const predictionData = dataOf(race);
    if (!actual || !predictionData) continue;
    const prediction = global.createPrediction(predictionData);
    const selection = selector.select(prediction);
    const tickets = (selection?.tickets || []).map(ticketOf).filter(Boolean);
    all.push({
      date,
      numericDate,
      actual,
      payout: payoutOf(race),
      tickets,
      trim: selection?.expansionSummary?.strongEscapeTrim || null
    });
  }
}

const pre = all.filter(row => row.numericDate < 20260807);
const target = all.filter(row => row.numericDate >= 20260807 && row.numericDate <= 20260810);
const preDates = [...new Set(pre.map(row => row.date))].sort();
const cut = Math.ceil(preDates.length / 2);
const earlyDates = new Set(preDates.slice(0, cut));
const lateDates = new Set(preDates.slice(cut));
const groups = {
  preEarly: pre.filter(row => earlyDates.has(row.date)),
  preLate: pre.filter(row => lateDates.has(row.date)),
  d0807_08: target.filter(row => row.numericDate <= 20260808),
  d0809_10: target.filter(row => row.numericDate >= 20260809)
};

function summarize(list) {
  const result = { races: 0, hits: 0, stake: 0, ret: 0, trimmed: 0, removed: 0 };
  for (const row of list) {
    result.races += 1;
    const hit = row.tickets.includes(row.actual);
    if (hit) {
      result.hits += 1;
      result.ret += row.payout;
    }
    result.stake += row.tickets.length * 100;
    if (row.trim?.applied === true) {
      result.trimmed += 1;
      result.removed += Number(row.trim.removedCount || 0);
    }
  }
  return result;
}

const actual = Object.fromEntries(
  Object.entries(groups).map(([name, list]) => [name, summarize(list)])
);
const expected = {
  preEarly: { races: 269, hits: 74, stake: 222200, ret: 146070, trimmed: 61, removed: 79 },
  preLate: { races: 188, hits: 60, stake: 158000, ret: 79640, trimmed: 66, removed: 86 },
  d0807_08: { races: 140, hits: 48, stake: 120100, ret: 93880, trimmed: 46, removed: 72 },
  d0809_10: { races: 173, hits: 59, stake: 144100, ret: 104470, trimmed: 68, removed: 105 }
};

for (const [name, want] of Object.entries(expected)) {
  const got = actual[name];
  for (const [key, value] of Object.entries(want)) {
    if (got[key] !== value) {
      throw new Error(`${name}.${key}: expected ${value}, got ${got[key]}`);
    }
  }
}

const removedTotal = Object.values(actual).reduce((sum, row) => sum + row.removed, 0);
if (removedTotal !== 342) {
  throw new Error(`expected 342 removed tickets, got ${removedTotal}`);
}

console.log("strong escape trim regression: PASS");
console.log(JSON.stringify(actual, null, 2));
