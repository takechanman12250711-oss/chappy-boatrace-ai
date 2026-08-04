const assert = require("node:assert/strict");
const boundary = require("../js/practical-selection-max7.js");

const ticketLines = [
  "1-2-3",
  "1-2-4",
  "1-3-2",
  "1-3-4",
  "2-1-3",
  "2-1-4",
  "3-1-2",
  "3-1-4",
  "4-1-2",
  "4-1-3"
];
const tickets = ticketLines.map((ticket, index) => ({
  ticket,
  selectionTier: index < 7 ? "通常" : "展開追加",
  priorityScore: 90 - index
}));

const selection = {
  status: "selected",
  reason: "基本5〜7点に、検証済みの独立展開だけを追加。",
  maximumCount: 10,
  tickets,
  excludedCandidates: [],
  candidateDecisions: tickets.map(row => ({ ...row, selected: true })),
  expansionSummary: {
    addedCount: 3,
    finalCount: 10,
    hasIndependentAdditions: true,
    exceededNormalMaximum: true,
    addedTickets: tickets.slice(7)
  },
  verificationEvidence: {
    generation: { ticketPolicyVersion: "practical-5-7-10-v1" },
    tickets: tickets.map(row => ({ ticket: row.ticket }))
  }
};

const normalized = boundary.normalizeSelection(selection);

assert.equal(boundary.MAXIMUM_COUNT, 7, "最大点数は7点固定");
assert.equal(normalized.maximumCount, 7, "返却値の最大点数も7");
assert.equal(normalized.tickets.length, 7, "購入対象は7点を超えない");
assert.equal(normalized.excludedCandidates.length, 3, "8点目以降は候補へ戻す");
assert.equal(normalized.expansionSummary.finalCount, 7, "監査上の最終点数も7");
assert.equal(normalized.expansionSummary.hasIndependentAdditions, false, "独立展開で購入点数を増やさない");
assert.equal(normalized.verificationEvidence.tickets.length, 7, "検証対象も購入7点と一致");
assert.equal(normalized.verificationEvidence.generation.ticketPolicyVersion, "practical-5-7-fixed-v1");
assert.deepEqual(
  normalized.tickets.map(row => row.ticket),
  tickets.slice(0, 7).map(row => row.ticket),
  "理論側が決めた先頭7点の順序を維持"
);
assert.equal(normalized.max7Boundary.removedCount, 3);

const noExpansion = boundary.normalizeSelection({
  tickets: tickets.slice(0, 5),
  maximumCount: 10,
  expansionSummary: { addedTickets: [] }
});
assert.equal(noExpansion.tickets.length, 5, "5点構成は変更しない");
assert.equal(noExpansion.maximumCount, 7);

console.log("practical max7 boundary: ok");
