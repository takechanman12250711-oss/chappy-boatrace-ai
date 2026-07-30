"use strict";

const assert = require("node:assert/strict");
const purchasesApi = require("../api/purchases")._test;
const purchaseStore = require("../api/_purchase-store");

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

async function run() {
  const env = {
    CHAPPY_PURCHASE_SYNC_TOKEN: "sync-secret",
    UPSTASH_REDIS_REST_URL: "https://redis.example",
    UPSTASH_REDIS_REST_TOKEN: "redis-secret"
  };
  const memory = [];
  const store = {
    async loadPurchases() {
      return memory.slice();
    },
    async savePurchases(next) {
      memory.splice(0, memory.length, ...next);
      return next;
    }
  };

  assert.equal(
    purchaseStore.getConfig(env).configured,
    true,
    "Redis REST設定を認識する"
  );
  assert.equal(
    purchasesApi.isAuthorized(
      { headers: { authorization: "Bearer sync-secret" } },
      env
    ),
    true,
    "Bearerトークンを検証する"
  );

  const unauthorized = response();
  await purchasesApi.handler(
    { method: "GET", headers: {}, query: {} },
    unauthorized,
    { env, store }
  );
  assert.equal(unauthorized.statusCode, 401);

  const post = response();
  await purchasesApi.handler(
    {
      method: "POST",
      headers: { authorization: "Bearer sync-secret" },
      body: {
        purchases: [
          {
            date: "2026/07/31",
            jcd: 7,
            raceNo: 5,
            ticket: "1-2-4",
            amount: 500,
            contractId: "contract-001"
          }
        ]
      }
    },
    post,
    { env, store }
  );
  assert.equal(post.statusCode, 200);
  assert.equal(post.body.received, 1);
  assert.equal(post.body.stored, 1);
  assert.equal(post.body.added, 1);

  const duplicate = response();
  await purchasesApi.handler(
    {
      method: "POST",
      headers: { authorization: "Bearer sync-secret" },
      body: JSON.stringify({
        purchases: [
          {
            date: "20260731",
            jcd: "07",
            raceNo: 5,
            ticket: "1-2-4",
            amount: 700,
            contractId: "contract-001"
          }
        ]
      })
    },
    duplicate,
    { env, store }
  );
  assert.equal(duplicate.body.stored, 1, "同じ契約IDを重複保存しない");
  assert.equal(duplicate.body.added, 0);
  assert.equal(memory[0].amount, 700, "再同期内容で更新する");

  const get = response();
  await purchasesApi.handler(
    {
      method: "GET",
      headers: { authorization: "Bearer sync-secret" },
      query: { date: "2026-07-31" }
    },
    get,
    { env, store }
  );
  assert.equal(get.statusCode, 200);
  assert.equal(get.body.count, 1);
  assert.equal(get.body.purchases[0].purchaseKey, "contract-001");
  assert.equal(get.headers["Cache-Control"], "no-store");

  const invalid = response();
  await purchasesApi.handler(
    {
      method: "POST",
      headers: { authorization: "Bearer sync-secret" },
      body: { purchases: [{ date: "20260731" }] }
    },
    invalid,
    { env, store }
  );
  assert.equal(invalid.statusCode, 400);

  console.log("purchase sync API regression: passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
