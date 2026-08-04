"use strict";

const assert = require("node:assert/strict");
const finalOdds = require("../js/final-odds-display.js");

const memory = new Map();
const storage = {
  getItem(key) {
    return memory.get(key) || null;
  },
  setItem(key, value) {
    memory.set(key, String(value));
  }
};

const livePrediction = {
  date: "20260804",
  stadiumCode: "12",
  raceNo: 10,
  race: {
    date: "20260804",
    stadiumCode: "12",
    raceNo: 10,
    status: "open"
  },
  ticketSheets: {
    main: [{ ticket: "1-2-3", odds: 8.4 }],
    cover: [{ ticket: "2-1-3", odds: 31.2 }],
    flow: [],
    hole: [],
    all: []
  },
  mainSheet: {
    tickets: [{ ticket: "1-2-3", odds: 8.4 }],
    coverTickets: [{ ticket: "2-1-3", odds: 31.2 }],
    flowTickets: []
  }
};

assert.equal(finalOdds.save(livePrediction, storage), true);

const endedPrediction = {
  ...livePrediction,
  race: {
    ...livePrediction.race,
    status: "finished"
  },
  ticketSheets: {
    ...livePrediction.ticketSheets,
    main: [{ ticket: "1-2-3", odds: null, oddsText: "オッズ未取得" }],
    cover: [{ ticket: "2-1-3", odds: null, oddsText: "オッズ未取得" }]
  },
  mainSheet: {
    ...livePrediction.mainSheet,
    tickets: [{ ticket: "1-2-3", odds: null, oddsText: "オッズ未取得" }],
    coverTickets: [{ ticket: "2-1-3", odds: null, oddsText: "オッズ未取得" }]
  }
};

const prepared = finalOdds.prepare(endedPrediction, storage);

assert.equal(prepared.ticketSheets.main[0].odds, 8.4);
assert.equal(prepared.ticketSheets.cover[0].odds, 31.2);
assert.equal(
  prepared.mainSheet.coverTickets[0].oddsText,
  "31.2倍（最終取得）"
);
assert.equal(prepared.finalOddsDisplay.label, "最終取得オッズ");
assert.notStrictEqual(prepared, endedPrediction);
assert.equal(endedPrediction.ticketSheets.main[0].odds, null);

const unknownRace = {
  ...endedPrediction,
  race: {
    date: "20260804",
    stadiumCode: "12",
    raceNo: 11,
    status: "finished"
  },
  raceNo: 11
};
assert.strictEqual(finalOdds.prepare(unknownRace, storage), unknownRace);

console.log("終了後の最終取得オッズ表示: 合格");
