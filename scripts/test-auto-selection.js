"use strict";

const assert = require("node:assert/strict");
const {
  buildViewModel,
  parseNoteDraft,
  ticketLabel
} = require("../js/auto-selection");

const parsed = parseNoteDraft("# 常滑1Rの予想\n\n無料部分\n\n---\n\n有料部分");
assert.equal(parsed.title, "常滑1Rの予想");
assert.equal(parsed.body, "無料部分\n\n---\n\n有料部分");

const withoutHeading = parseNoteDraft("本文だけ", "保存済みタイトル");
assert.equal(withoutHeading.title, "保存済みタイトル");
assert.equal(withoutHeading.body, "本文だけ");

const view = buildViewModel({
  runs: [{
    checkedAt: "2026-07-22T00:00:00.000Z",
    threshold: 70,
    selected: true,
    best: { score: 72.5, type: "本線" },
    compared: [{ jcd: "08" }]
  }],
  predictions: [{
    selectedAt: "2026-07-22T00:00:01.000Z",
    note: { path: "data/notes/20260722-08-01R.md" },
    prediction: {
      practicalTickets: [
        { ticket: "1-2-3", category: "本線" },
        { combination: "1-3-2", type: "押さえ" }
      ]
    }
  }]
});

assert.equal(view.score, 72.5);
assert.equal(view.venues, 1);
assert.equal(view.tickets.length, 2);
assert.equal(ticketLabel(view.tickets[1]), "1-3-2");

console.log("auto-selection tests passed");
