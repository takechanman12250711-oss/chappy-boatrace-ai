"use strict";

const assert = require("node:assert/strict");
const finalOdds = require("../js/final-odds-display.js");

const prediction = {
  date: "20260905",
  stadiumCode: "05",
  raceNo: 7,
  race: {
    date: "20260905",
    stadiumCode: "05",
    raceNo: 7,
    status: "open"
  },
  aiTicketList: [
    { ticket: "1-2-3", currentOdds: 8.6 },
    { ticket: "1-2-4", finalOdds: 12.4 },
    { ticket: "1-3-2", oddsText: "15.7倍" },
    { formation: { notation: "2-1-3" }, value: 24.8 }
  ],
  oddsByTicket: {
    "3-1-2": 31.6,
    "4-1-2": { currentOdds: 102.5 }
  },
  trifectaOdds: {
    "5-1-2": { oddsText: "188.4倍" }
  }
};

const collected = finalOdds.collectOdds(prediction);
assert.equal(collected["1-2-3"], 8.6, "currentOddsを保存できる");
assert.equal(collected["1-2-4"], 12.4, "finalOddsを保存できる");
assert.equal(collected["1-3-2"], 15.7, "oddsTextを数値化できる");
assert.equal(collected["2-1-3"], 24.8, "formation.notation + valueを保存できる");
assert.equal(collected["3-1-2"], 31.6, "oddsByTicket直値を保存できる");
assert.equal(collected["4-1-2"], 102.5, "oddsByTicket object値を保存できる");
assert.equal(collected["5-1-2"], 188.4, "trifectaOddsのoddsTextを保存できる");

const memory = new Map();
const storage = {
  getItem(key) { return memory.get(key) || null; },
  setItem(key, value) { memory.set(key, String(value)); }
};
assert.equal(finalOdds.save(prediction, storage), true);

const ended = {
  ...prediction,
  race: { ...prediction.race, status: "finished" },
  aiTicketList: [
    { ticket: "1-2-3", odds: null },
    { ticket: "1-2-4", odds: null },
    { ticket: "1-3-2", odds: null },
    { formation: { notation: "2-1-3" }, odds: null }
  ]
};
const prepared = finalOdds.prepare(ended, storage);
assert.equal(prepared.aiTicketList[0].odds, 8.6);
assert.equal(prepared.aiTicketList[1].odds, 12.4);
assert.equal(prepared.aiTicketList[2].odds, 15.7);
assert.equal(prepared.aiTicketList[3].odds, 24.8);
assert.equal(prepared.aiTicketList[0].oddsText, "8.6倍（最終取得）");

console.log("final odds field compatibility: ok");
