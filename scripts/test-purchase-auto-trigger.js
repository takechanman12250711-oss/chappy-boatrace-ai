"use strict";

const assert = require("node:assert/strict");
const purchasesApi = require("../api/purchases")._test;

function response() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
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
    CHAPPY_API_BASE_URL: "https://api.example/"
  };

  assert.equal(
    purchasesApi.getOrigin({ headers: {} }, env),
    "https://api.example",
    "設定済みAPI URLを優先する"
  );
  assert.equal(
    purchasesApi.getOrigin({
      headers: {
        "x-forwarded-host": "preview.example",
        "x-forwarded-proto": "https"
      }
    }, {}),
    "https://preview.example",
    "リクエストホストから接続先を生成する"
  );

  let requestedUrl = "";
  let requestedToken = "";
  const triggered = await purchasesApi.triggerSettlement(
    { headers: {} },
    env,
    async (url, options) => {
      requestedUrl = url;
      requestedToken = options.headers.Authorization;
      return { ok: true, status: 200 };
    }
  );
  assert.equal(requestedUrl, "https://api.example/api/settle-purchases");
  assert.equal(requestedToken, "Bearer sync-secret");
  assert.deepEqual(triggered, { triggered: true, status: 200 });

  const memory = [];
  const store = {
    async loadPurchases() {
      return memory.slice();
    },
    async savePurchases(next) {
      memory.splice(0, memory.length, ...next);
    }
  };
  let settleCalls = 0;
  const res = response();
  await purchasesApi.handler(
    {
      method: "POST",
      headers: { authorization: "Bearer sync-secret" },
      body: {
        purchases: [{
          date: "20260731",
          jcd: "07",
          raceNo: 5,
          ticket: "1-2-4",
          amount: 500,
          contractId: "contract-auto-001"
        }]
      }
    },
    res,
    {
      env,
      store,
      fetchImpl: async () => {
        settleCalls += 1;
        return { ok: true, status: 200 };
      }
    }
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.stored, 1);
  assert.equal(settleCalls, 1, "保存後に自動照合を1回呼ぶ");
  assert.deepEqual(res.body.autoSettlement, { triggered: true, status: 200 });

  const failed = await purchasesApi.triggerSettlement(
    { headers: {} },
    env,
    async () => {
      throw new Error("temporary failure");
    }
  );
  assert.equal(failed.triggered, false, "照合失敗を同期失敗にしない");

  console.log("purchase auto trigger regression: passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
