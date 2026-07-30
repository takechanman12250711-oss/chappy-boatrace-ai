"use strict";

const assert = require("node:assert/strict");
const api = require("../api/settle-purchases")._test;

function response() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

async function run() {
  const env = { CHAPPY_PURCHASE_SYNC_TOKEN: "secret" };
  const memory = [
    { purchaseKey: "a", raceKey: "20260731-07-5", date: "20260731", jcd: "07", raceNo: 5, ticket: "1-2-4", amount: 500 },
    { purchaseKey: "b", raceKey: "20260731-07-5", date: "20260731", jcd: "07", raceNo: 5, ticket: "1-3-2", amount: 300 }
  ];
  const store = {
    async loadPurchases() { return memory.slice(); },
    async savePurchases(next) { memory.splice(0, memory.length, ...next); return next; }
  };
  const fetchImpl = async () => ({
    ok: true,
    async json() {
      return {
        resultAvailable: true,
        winningMethod: "逃げ",
        trifecta: { combination: "1-2-4", payout: 1250, popularity: 3 }
      };
    }
  });

  assert.deepEqual(api.getPendingRaceKeys(memory), ["20260731-07-5"]);
  assert.equal(api.isAuthorized({ headers: { authorization: "Bearer secret" } }, env), true);

  const unauthorized = response();
  await api.handler({ method: "POST", headers: {} }, unauthorized, { env, store, fetchImpl, origin: "https://example.test" });
  assert.equal(unauthorized.statusCode, 401);

  const settled = response();
  await api.handler(
    { method: "POST", headers: { authorization: "Bearer secret" } },
    settled,
    { env, store, fetchImpl, origin: "https://example.test" }
  );

  assert.equal(settled.statusCode, 200);
  assert.equal(settled.body.checkedRaces, 1);
  assert.equal(settled.body.updatedPurchases, 2);
  assert.equal(memory[0].settlementStatus, "settled");
  assert.equal(memory[0].hit, true);
  assert.equal(memory[0].payout, 6250);
  assert.equal(memory[1].hit, false);
  assert.equal(settled.body.summary.stake, 800);
  assert.equal(settled.body.summary.payout, 6250);

  assert.deepEqual(api.getPendingRaceKeys(memory), []);
  console.log("purchase auto settle api regression: passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
