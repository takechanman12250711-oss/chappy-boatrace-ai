"use strict";

const assert = require("node:assert/strict");
const purchaseSync = require("../js/purchase-sync-core");

const raw = {
  date: "2026/07/31",
  jcd: 7,
  raceNo: 5,
  ticket: "1-2-4",
  amount: 500,
  contractId: "contract-001"
};

const normalized = purchaseSync.normalizePurchase(raw);
assert.equal(normalized.raceKey, "20260731-07-5");
assert.equal(normalized.ticket, "1-2-4");
assert.equal(normalized.amount, 500);
assert.equal(normalized.purchaseKey, "contract-001");

assert.equal(
  purchaseSync.normalizePurchase({ ...raw, amount: 0 }),
  null,
  "0円購入は取り込まない"
);
assert.equal(
  purchaseSync.normalizePurchase({ ...raw, ticket: "1-7-2" }),
  null,
  "不正な艇番は取り込まない"
);

const merged = purchaseSync.mergePurchases(
  [raw],
  [{ ...raw, amount: 700 }]
);
assert.equal(merged.length, 1, "同一契約IDを重複登録しない");
assert.equal(merged[0].amount, 700, "再同期時は最新明細へ更新する");

const linked = purchaseSync.linkPurchasesToPredictions([raw], [
  {
    raceKey: "20260731-07-5",
    prediction: {
      practicalTickets: [
        { ticket: "1-2-4", category: "本線" },
        { ticket: "1-3-2", category: "押さえ" }
      ]
    }
  }
]);

assert.equal(linked[0].predictionLinked, true);
assert.equal(linked[0].recommendedTicket, true);

const outside = purchaseSync.linkPurchasesToPredictions(
  [{ ...raw, contractId: "contract-002", ticket: "2-1-4" }],
  [{
    raceKey: "20260731-07-5",
    prediction: { practicalTickets: [{ ticket: "1-2-4" }] }
  }]
);
assert.equal(outside[0].recommendedTicket, false, "推奨外購入を判別する");

console.log("purchase sync core regression: passed");
