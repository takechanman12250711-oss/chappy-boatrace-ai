"use strict";
const assert = require("node:assert/strict");
const boundary = require("../js/main-cover-display-boundary.js");

const prediction = {
  mainSheet: {
    tickets: [{ ticket: "1-2-3", odds: 12.4, oddsText: "12.4倍", comment: "本命コメント" }],
    coverTickets: [{ ticket: "2-1-3", odds: 24.8, oddsText: "24.8倍", comment: "押さえコメント" }],
    flowTickets: [{ ticket: "1-23-全", oddsText: "8点" }]
  },
  ticketSheets: {
    main: [{ ticket: "1-2-3", category: "本命" }],
    cover: [{ ticket: "2-1-3", category: "押さえ" }]
  },
  formations: {
    main: ["1-2-3"],
    safety: ["2-1-3"]
  }
};

const prepared = boundary.prepare(prediction);
assert.equal(prepared.mainSheet.tickets[0].ticket, "1-2-3");
assert.equal(prepared.mainSheet.tickets[0].category, "本命");
assert.equal(prepared.mainSheet.tickets[0].odds, 12.4);
assert.equal(prepared.mainSheet.tickets[0].oddsText, "12.4倍");
assert.equal(prepared.mainSheet.coverTickets[0].ticket, "2-1-3");
assert.equal(prepared.mainSheet.coverTickets[0].category, "押さえ");
assert.equal(prepared.mainSheet.coverTickets[0].odds, 24.8);
assert.equal(prepared.mainSheet.coverTickets[0].oddsText, "24.8倍");
assert.deepEqual(prepared.mainSheet.flowTickets, prediction.mainSheet.flowTickets);
assert.deepEqual(prepared.formations, prediction.formations);
assert.notStrictEqual(prepared, prediction);
assert.equal(prediction.mainSheet.tickets[0].odds, 12.4);

const directOdds = boundary.prepare({
  mainSheet: { tickets: [{ ticket: "1-3-2", odds: 18.6 }] },
  ticketSheets: { main: [{ ticket: "1-3-2", odds: 19.1, category: "本命" }] }
});
assert.equal(directOdds.mainSheet.tickets[0].odds, 19.1);

const unchanged = { mainSheet: prediction.mainSheet, ticketSheets: {} };
assert.strictEqual(boundary.prepare(unchanged), unchanged);
console.log("main/cover display boundary odds preserve: ok");
