"use strict";
const assert = require("node:assert/strict");
const boundary = require("../js/main-cover-display-boundary.js");

const prediction = {
  mainSheet: {
    tickets: [{ ticket: "3-1-2", odds: 30 }],
    coverTickets: [{ ticket: "4-1-2", odds: 40 }],
    flowTickets: [{ ticket: "1-23-全", oddsText: "8点" }]
  },
  ticketSheets: {
    main: [{ ticket: "1-2-3", odds: 12.4, category: "本命" }],
    cover: [{ ticket: "2-1-3", odds: 24.8, category: "押さえ" }]
  },
  formations: {
    main: ["1-2-3"],
    safety: ["2-1-3"]
  }
};

const prepared = boundary.prepare(prediction);
assert.deepEqual(prepared.mainSheet.tickets, prediction.ticketSheets.main);
assert.deepEqual(prepared.mainSheet.coverTickets, prediction.ticketSheets.cover);
assert.deepEqual(prepared.mainSheet.flowTickets, prediction.mainSheet.flowTickets);
assert.deepEqual(prepared.formations, prediction.formations);
assert.notStrictEqual(prepared, prediction);
assert.equal(prediction.mainSheet.tickets[0].ticket, "3-1-2");

const unchanged = { mainSheet: prediction.mainSheet, ticketSheets: {} };
assert.strictEqual(boundary.prepare(unchanged), unchanged);
console.log("main/cover display boundary: ok");
