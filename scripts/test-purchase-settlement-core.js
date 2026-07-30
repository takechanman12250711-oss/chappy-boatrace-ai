"use strict";

const assert = require("node:assert/strict");
const {
  settlePurchase,
  settlePurchases,
  summarizeSettlements
} = require("../js/purchase-settlement-core");

const purchase = {
  raceKey: "20260731-07-5",
  ticket: "1-2-4",
  amount: 500
};
const result = {
  resultAvailable: true,
  winningMethod: "逃げ",
  trifecta: {
    combination: "1-2-4",
    payout: 1230,
    popularity: 4
  }
};

const hit = settlePurchase(purchase, result);
assert.equal(hit.settlementStatus, "settled");
assert.equal(hit.hit, true);
assert.equal(hit.payout, 6150);
assert.equal(hit.profit, 5650);
assert.equal(hit.returnRate, 1230);

const miss = settlePurchase({ ...purchase, ticket: "1-3-4" }, result);
assert.equal(miss.hit, false);
assert.equal(miss.payout, 0);
assert.equal(miss.profit, -500);

const pending = settlePurchase(purchase, { resultAvailable: false });
assert.equal(pending.settlementStatus, "pending");
assert.equal(pending.hit, null);

const settled = settlePurchases(
  [purchase, { ...purchase, ticket: "1-3-4", purchaseKey: "two" }],
  { "20260731-07-5": result }
);
const summary = summarizeSettlements(settled);
assert.equal(summary.settledTickets, 2);
assert.equal(summary.hits, 1);
assert.equal(summary.stake, 1000);
assert.equal(summary.payout, 6150);
assert.equal(summary.profit, 5150);
assert.equal(summary.returnRate, 615);

console.log("purchase settlement core regression: passed");
